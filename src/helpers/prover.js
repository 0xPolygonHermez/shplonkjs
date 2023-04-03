const {Polynomial} = require("../polynomial/polynomial.js");
const { Scalar } = require("ffjavascript");
const { lcm } = require("../utils.js");

/**
 *  Compute the coefficients of Ri(X) from evaluations using lagrange interpolation. R0(X) ∈ F_{<N}[X]
 *  We decide to use Lagrange interpolations because the Ri degree is very small,
 *  and we were not able to compute it using current ifft implementation because the omega are different
 */
async function computeRi(f, roots, curve, logger) {
    const rootsRi = roots.flat();
    const evals = [];
    rootsRi.forEach(r => {
        return evals.push(f.evaluate(r));
    });
    
    const ri = Polynomial.lagrangePolynomialInterpolation(rootsRi, evals, curve);

    if (ri.degree() > rootsRi.length - 1) {
        throw new Error("r Polynomial is not well calculated");
    }
    
    return ri;  
}

/**
 * 
 */
exports.computeR = async function computeR(f, roots, curve, logger) {
    const fPols = f.map(fi => fi.pol);
    const promises = [];
    for(let i = 0; i < fPols.length; ++i) {
        if (logger) logger.info(`> Computing r${i} polynomial`);
        promises.push(computeRi(fPols[i], roots[i], curve, logger));
    }

    const r = await Promise.all(promises);
    return r;
}

/**
 * 
 */
exports.calculateEvaluations = function calculateEvaluations(pk, polynomials, xiSeed, curve, logger) {
    if (logger) logger.info(`> Computing evaluations`);

    // Calculate the array of opening points
    const openingPoints = []; 

    // Firstly, calculate challenge xi, which will be xiSeed ^ lcm(f)
    const powerW = lcm(Object.keys(pk).filter(k => k.match(/^w\d+$/)).map(wi => wi.slice(1)));

    let challengeXi = curve.Fr.exp(xiSeed, powerW);
    openingPoints.push(challengeXi);

    // Calculate all the subsequent opening points zw, zw²... and add it to opening points
    let challengeXiw = challengeXi;

    let nOpening = [];
    for(let i = 0; i < pk.f.length; ++i) {
        for(let j = 0; j < pk.f[i].openingPoints.length; ++j) {
            if(!nOpening.includes(pk.f[i].openingPoints[j])) nOpening.push(pk.f[i].openingPoints[j])
        }
    }
    for(let i = 1; i < nOpening.length; ++i) {
        challengeXiw = curve.Fr.mul(challengeXiw, pk["w1_1d1"]);
        openingPoints.push(challengeXiw);
    }
        
    // Calculate evaluations
    const evaluations = {};
    for(let i = 0; i < pk.f.length; ++i) {
        for(let j = 0; j < pk.f[i].openingPoints.length; ++j) {
            for(let k = 0; k < pk.f[i].pols.length; ++k) {
                const openingIndex = pk.f[i].openingPoints[j];
                const wPower = openingIndex === 0 ? "" : openingIndex === 1 ? "w" : `w${openingIndex}`;
                const polName = pk.f[i].pols[k];

                // The polynomial must be committed previously in order to be opened
                if(!polynomials[polName]) throw new Error(`Polynomial ${polName} is not committed`);

                // Store the evaluations in an object
                evaluations[polName + wPower] = polynomials[polName].evaluate(openingPoints[openingIndex]);
            }
        }
    }

    return {evaluations, openingPoints};
}

/**
 * 
 */
exports.computeW = function computeW(f, r, roots, challengeAlpha, openingPoints, curve, logger) {
    if (logger) logger.info("> Computing W polynomial");

    const fPols = f.map(fi => fi.pol);

    let W;
    let challenge = curve.Fr.one;
    for(let i = 0; i < fPols.length; i++) {
        let fi = Polynomial.fromPolynomial(fPols[i], curve, logger); 
        fi.sub(r[i]);
        fi.mulScalar(challenge);
        challenge = curve.Fr.mul(challenge, challengeAlpha);
    
        for(let k = 0; k < f[i].openingPoints.length; k++) {
            const nRoots = roots[i][k].length;
            fi.divByZerofier(nRoots, openingPoints[f[i].openingPoints[k]]);
        }
        
        if(i === 0) {
            W = fi;
        } else {
            W.add(fi);
        }
    }

    const nTotalRoots = f.reduce((acc, curr) => acc + curr.pols.length*curr.openingPoints.length,0);
    let maxDegree = 0;
    for(let i = 0; i < f.length; ++i) {
        const fiDegree = f[i].degree + nTotalRoots - f[i].pols.length * f[i].openingPoints.length;
        if(fiDegree > maxDegree) maxDegree = fiDegree;
    }

    if(W.degree() > maxDegree - nTotalRoots) {
        throw new Error("W polynomial is not well calculated");
    }


    return W;
}

/**
 * 
 */
function computeL(F, f, r, roots, challengeY, challengeAlpha, curve, logger) {
    if (logger) logger.info("··· Computing L polynomial");

    const fPols = f.map(fi => fi.pol);

    const mulL = [];

    for(let i = 0; i < roots.length; ++i) {
        const rootsRi = roots[i].flat();
        let mulLi = curve.Fr.one;
        for (let j = 0; j < rootsRi.length; j++) {
            mulLi = curve.Fr.mul(mulLi, curve.Fr.sub(challengeY, rootsRi[j]));
        }
        mulL.push(mulLi);
    }
    
    const preL = new Array(mulL.length);

    let challenge = curve.Fr.one;
    for(let i = 0; i < mulL.length; i++) {
        preL[i] = challenge;
        challenge = curve.Fr.mul(challenge, challengeAlpha);
        for(let j = 0; j < mulL.length; j++) {
            if(j !== i) {
                preL[i] = curve.Fr.mul(preL[i], mulL[j]);
            }
        }
    }
    
    // COMPUTE F(X)
    const evalRiY = [];
    r.forEach(ri => evalRiY.push(ri.evaluate(challengeY)));

    let L;
    for(let i = 0; i < fPols.length; i++) {
        let li = Polynomial.fromPolynomial(fPols[i], curve, logger);
        li.subScalar(evalRiY[i]);
        li.mulScalar(preL[i]);
       
        if(i === 0) {
            L = li;
        } else {
            L.add(li);
        }
    }

    const ZT = Polynomial.zerofierPolynomial(roots.flat(Infinity), curve);
    const evalZTY = ZT.evaluate(challengeY);
    F.mulScalar(evalZTY);
    L.sub(F);

    const maxFiDegree = Math.max(...f.map(fi => fi.degree));
    if(L.degree() > maxFiDegree) {
        throw new Error("Degree of Wp(X) is wrong");
    }

    return L;
}


exports.computeWp = function computeWp(f, r, roots, W, challengeY, challengeAlpha, curve, logger) {

    // 1 - Compute L
    const L = computeL(W, f, r, roots, challengeY, challengeAlpha, curve, logger);

    if (logger) logger.info(`> Computing ZTS2 polynomial`);

    // 2 - Compute ZTS2
    const ZTS2 = Polynomial.zerofierPolynomial(roots.slice(1).flat(Infinity), curve);

    // 3 - Compute W'= L/ZTS2
    let ZTS2Y = ZTS2.evaluate(challengeY);
    ZTS2Y = curve.Fr.inv(ZTS2Y);
    L.mulScalar(ZTS2Y);
    L.divByXSubValue(challengeY);

    const maxFiDegree = Math.max(...f.map(fi => fi.degree)) - 1;
    if(L.degree() > maxFiDegree) {
        throw new Error("Degree of Wp(X) is wrong");
    }

    return L;
}

function computeLiMultipleOpeningPoints(toInverse, roots, curve, logger) {
    const rootsRi = roots.flat();
    for(let i = 0; i < rootsRi.length; ++i) {
        let idx = i;
        let den = curve.Fr.one;
        for (let j = 0; j < rootsRi.length - 1; j++) {
            idx = (idx + 1) % rootsRi.length;
            den = curve.Fr.mul(den, curve.Fr.sub(rootsRi[i], rootsRi[idx]));
        }
        toInverse.push(den);
    }
}

function computeLiTwoOpeningPoints(toInverse, roots, value, xi0, xi1, curve) {
    const Fr = curve.Fr;

    const len = roots[0].length;

    let den1 = Fr.mul(Fr.mul(Fr.e(len), Fr.exp(roots[0][0], len - 2)), Fr.sub(xi0, xi1));
    for (let i = 0; i < len; i++) {
        const den2 = roots[0][(len - 1) * i % len];
        const den3 = Fr.sub(value, roots[0][i]);

        toInverse.push(Fr.mul(den1,Fr.mul(den2, den3)));
        
    }

    den1 = Fr.mul(Fr.mul(Fr.e(len), Fr.exp(roots[1][0], len - 2)), Fr.sub(xi1, xi0));
    for (let i = 0; i < len; i++) {
        const den2 = roots[1][(len - 1) * i % len];
        const den3 = Fr.sub(value, roots[1][i]);

        toInverse.push(Fr.mul(den1,Fr.mul(den2, den3)));    
    }
}

function computeLiSingleOpeningPoint(toInverse, roots, x, curve, logger) {
    const Fr = curve.Fr;
    const len = roots.length;

    const den1 = Fr.mul(Fr.e(len), Fr.exp(roots[0], len - 2));

    if(len === 1) return [curve.Fr.one];
    
    for (let i = 0; i < len; i++) {
        const den2 = roots[((len - 1) * i) % len];
        const den3 = Fr.sub(x, roots[i]);

        toInverse.push(Fr.mul(Fr.mul(den1, den2), den3));

    }
}

exports.getMontgomeryBatchedInverse = function getMontgomeryBatchedInverse(zkey, roots, challengeY, challengeXi, curve, logger) {
    if (logger) logger.info(`> Getting Montgomery batched inverse`);

    // Define an array to store the inverses that will be calculated in the solidity verifier
    const toInverse = [];

    let dens = [];
    for(let i = 1; i < zkey.f.length; ++i) {
        let wName = zkey.f[i].openingPoints[0] === 0 ? `${zkey.f[i].pols.length}_${zkey.f[i].openingPoints.join("")}` : `${zkey.f[i].pols.length}_${zkey.f[i].openingPoints[0]}d${zkey.f[i].pols.length}_${zkey.f[i].openingPoints.join("")}`; 
        if(!dens.includes(wName)) {
            dens.push(wName);
            const rootsRi = roots[zkey.f[i].index].flat();
            let mulLi = curve.Fr.one;
            for (let j = 0; j < rootsRi.length; j++) {
                mulLi = curve.Fr.mul(mulLi, curve.Fr.sub(challengeY, rootsRi[j]));
            }
            toInverse.push(mulLi);       
        }
    }
    
    let liNames = [];
    for(let i = 0; i < zkey.f.length; ++i) {
        let wName = zkey.f[i].openingPoints[0] === 0 ? `${zkey.f[i].pols.length}_${zkey.f[i].openingPoints.join("")}` : `${zkey.f[i].pols.length}_${zkey.f[i].openingPoints[0]}d${zkey.f[i].pols.length}_${zkey.f[i].openingPoints.join("")}`
        if(!liNames.includes(wName)) {
            liNames.push(wName);
            const rootsRi = roots[zkey.f[i].index];
            if(zkey.f[i].openingPoints.length > 2) {
                computeLiMultipleOpeningPoints(toInverse, rootsRi, curve, logger);
            } else if (zkey.f[i].openingPoints.length === 2) {
                let xi0 = challengeXi;
                for(let j = 0; j < zkey.f[i].openingPoints[0]; ++j) {
                    xi0 = curve.Fr.mul(xi0, zkey.w1_1d1);
                }

                let xi1 = challengeXi;
                for(let j = 0; j < zkey.f[i].openingPoints[1]; ++j) {
                    xi1 = curve.Fr.mul(xi1, zkey.w1_1d1);
                }

                computeLiTwoOpeningPoints(toInverse, rootsRi, challengeY, xi0, xi1, curve, logger);  
            } else if (zkey.f[i].pols.length > 1) {
                computeLiSingleOpeningPoint(toInverse, rootsRi[0], challengeY, curve, logger);
            }
        }
    }

    let mulAccumulator = curve.Fr.one;
    for(let i = 0; i < toInverse.length; ++i) {
        mulAccumulator = curve.Fr.mul(mulAccumulator, toInverse[i]);
    }
 
    return curve.Fr.inv(mulAccumulator);
}


