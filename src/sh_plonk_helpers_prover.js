import {Polynomial} from "./polynomial/polynomial.js";

async function computeRi(f, roots, curve, logger) {
    // COMPUTE Ri
    // Compute the coefficients of Ri(X) from evaluations using lagrange interpolation. R0(X) ∈ F_{<N}[X]
    // We decide to use Lagrange interpolations because the Ri degree is very small,
    // and we were not able to compute it using current ifft implementation because the omega are different

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

export async function computeR(f, roots, curve, logger) {
    const fPols = f.map(fi => fi.pol);
    const promises = [];
    for(let i = 0; i < fPols.length; ++i) {
        if (logger) logger.info("> Computing r polynomial");
        promises.push(computeRi(fPols[i], roots[i], curve, logger));
    }

    const r = await Promise.all(promises);
    return r;
}

export function calculateEvaluations(pk, ctx, xiSeed, curve, logger) {
    // Calculate the array of opening points
    const openingPoints = []; 

    // Firstly, calculate challenge xi, which will be xiSeed ^ lcm(f)
    let challengesXi = curve.Fr.one;
    for(let i = 0; i < pk.powerW; ++i) {
        challengesXi = curve.Fr.mul(challengesXi, xiSeed);
    }
    openingPoints.push(challengesXi);

    // Calculate all the subsequent opening points zw, zw²... and add it to opening points
    let challengesXiw = challengesXi;

    for(let i = 1; i < pk.nOpeningPoints; ++i) {
        challengesXiw = curve.Fr.mul(challengesXiw, curve.Fr.w[pk.power]);
        openingPoints.push(challengesXiw);
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
                if(!ctx[polName]) throw new Error(`Polynomial ${polName} is not committed`);

                // Store the evaluations in an object
                evaluations[polName + wPower] = ctx[polName].evaluate(openingPoints[openingIndex]);
            }
        }
    }

    return {evaluations, openingPoints};
}

export function computeW(f, r, roots, challengesAlpha, openingPoints, curve, logger) {
    if (logger) logger.info("> Computing W polynomial");

    const fPols = f.map(fi => fi.pol);

    let W;
    let challenge = curve.Fr.one;
    for(let i = 0; i < fPols.length; i++) {
        let fi = Polynomial.fromPolynomial(fPols[i], curve, logger); 
        fi.sub(r[i]);
        fi.mulScalar(challenge);
        challenge = curve.Fr.mul(challenge, challengesAlpha);
    
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

function computeL(F, ZT, f, r, roots, challengesY, challengesAlpha, toInverse, curve, logger) {
    if (logger) logger.info("··· Computing L polynomial");

    const fPols = f.map(fi => fi.pol);

    const mulL = [];

    for(let i = 0; i < roots.length; ++i) {
        const rootsRi = roots[i].flat();
        let mulLi = curve.Fr.one;
        for (let j = 0; j < rootsRi.length; j++) {
            mulLi = curve.Fr.mul(mulLi, curve.Fr.sub(challengesY, rootsRi[j]));
        }
        mulL.push(mulLi);
        if(i >= 1) toInverse.push(mulLi);
    }
    
    const preL = new Array(mulL.length);

    let challenge = curve.Fr.one;
    for(let i = 0; i < mulL.length; i++) {
        preL[i] = challenge;
        challenge = curve.Fr.mul(challenge, challengesAlpha);
        for(let j = 0; j < mulL.length; j++) {
            if(j !== i) {
                preL[i] = curve.Fr.mul(preL[i], mulL[j]);
            }
        }
    }
    
    // COMPUTE F(X)
    const evalRiY = [];
    r.forEach(ri => evalRiY.push(ri.evaluate(challengesY)));

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

    const evalZTY = ZT.evaluate(challengesY);
    F.mulScalar(evalZTY);
    L.sub(F);

    const maxFiDegree = Math.max(...f.map(fi => fi.degree));
    if(L.degree() > maxFiDegree) {
        throw new Error("Degree of Wp(X) is wrong");
    }

    return L;
}


function computeZT(roots, curve, logger) {
    if (logger) logger.info("> Computing ZT polynomial");
    const sRoots = roots.flat(Infinity);
    return Polynomial.zerofierPolynomial(sRoots, curve);
}

function computeZTS2(roots, curve, logger) {
    if (logger) logger.info("> Computing ZTS2 polynomial");
    
    const sRoots = [];
    for(let i = 1; i < roots.length; ++i) {
        sRoots.push(...roots[i].flat(Infinity));
    }
    
    return Polynomial.zerofierPolynomial(sRoots, curve);
}

export function computeWp(f, r, roots, W, challengesY, challengesAlpha, toInverse, curve, logger) {

    // 0 - Compute ZT
    const ZT = computeZT(roots, curve, logger);

    // 1 - Compute L
    const L = computeL(W, ZT, f, r, roots, challengesY, challengesAlpha, toInverse, curve, logger);

    // 2 - Compute ZTS2
    const ZTS2 = computeZTS2(roots, curve, logger);

    // 3 - Compute W'= L/ZTS2
    let ZTS2Y = ZTS2.evaluate(challengesY);
    ZTS2Y = curve.Fr.inv(ZTS2Y);
    L.mulScalar(ZTS2Y);
    
    const polDividend = Polynomial.fromCoefficientsArray([curve.Fr.neg(challengesY), curve.Fr.one], curve);
    const polRemainder = L.divBy(polDividend);

    //Check polReminder degree is equal to zero
    if (polRemainder.degree() > 0) {
        throw new Error(`Degree of L(X)/(ZTS2(y)(X-y)) remainder is ${polRemainder.degree()} and should be 0`);
    }

    const maxFiDegree = Math.max(...f.map(fi => fi.degree));

    if(L.degree() > maxFiDegree - 1) {
        throw new Error("Degree of Wp(X) is wrong");
    }

    return L;
}

function computeLi(toInverse, roots, curve, logger) {
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

export function getMontgomeryBatchedInverse(roots, toInverse, curve, logger) {
    //   · denominator needed in step 10 and 11 of the verifier
    //     toInverse.denH1 & toInverse.denH2  -> Computed in round5, computeL()

    //   · denominator needed in the verifier when computing L_i^{S0}(X), L_i^{S1}(X) and L_i^{S2}(X)

    for(let i = 0; i < roots.length; ++i) {
        computeLi(toInverse, roots[i], curve, logger);
    }

    let mulAccumulator = curve.Fr.one;
    for(let i = 0; i < toInverse.length; ++i) {
        mulAccumulator = curve.Fr.mul(mulAccumulator, toInverse[i]);
    }
 
    return curve.Fr.inv(mulAccumulator);
}


