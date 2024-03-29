const {Polynomial} = require("../polynomial/polynomial.js");
const {Scalar} = require("ffjavascript");

function computeLagrangeSingleOpeningPoint(roots, toInverse, x, xi, curve, addInverse) {
    const Fr = curve.Fr;
    const len = roots.length;
    
    if(len === 1) return [curve.Fr.one];
    const num = Fr.sub(Fr.exp(x, len), xi);
    const den1 = Fr.mul(Fr.e(len), Fr.exp(roots[0], len - 2));
    
    const Li = [];
    for (let i = 0; i < len; i++) {
        const den2 = roots[((len - 1) * i) % len];
        const den3 = Fr.sub(x, roots[i]);

        const den = Fr.mul(den1,Fr.mul(den2, den3));
        if(addInverse) toInverse.push(den);
        
        Li[i] = Fr.div(num, den);
    }

    return Li;
}

function computeLagrangeTwoOpeningPoints(roots, toInverse, value, xi0, xi1, curve, addInverse) {
    const Fr = curve.Fr;

    const Li = [];

    const len = roots[0].length;
    const n = len * roots.length;

    if(len === 1) {
        const den1 = Fr.sub(roots[0][0], roots[1][0]);
        const den2 = Fr.sub(roots[1][0], roots[0][0]);
        if(addInverse) {
            toInverse.push(den1);
            toInverse.push(den2);
        }
        return [
            Fr.div(Fr.sub(value, roots[1][0]), den1),
            Fr.div(Fr.sub(value, roots[0][0]), den2)
        ]
    }

    const num1 = Fr.exp(value, n);

    const num2 = Fr.mul(Fr.add(xi0, xi1), Fr.exp(value, len));
    const num3 = Fr.mul(xi0, xi1);
    const num = Fr.add(Fr.sub(num1, num2), num3);

    let den1 = Fr.mul(Fr.mul(Fr.e(len), Fr.exp(roots[0][0], len - 2)), Fr.sub(xi0, xi1));
    for (let i = 0; i < len; i++) {
        const den2 = roots[0][(len - 1) * i % len];
        const den3 = Fr.sub(value, roots[0][i]);

        const den = Fr.mul(den1,Fr.mul(den2, den3));

        if(addInverse) toInverse.push(den);
        Li[i] = Fr.div(num, den);
    }

    den1 = Fr.mul(Fr.mul(Fr.e(len), Fr.exp(roots[1][0], len - 2)), Fr.sub(xi1, xi0));

    for (let i = 0; i < len; i++) {
        const den2 = roots[1][(len - 1) * i % len];
        const den3 = Fr.sub(value, roots[1][i]);

        const den = Fr.mul(den1,Fr.mul(den2, den3));

        if(addInverse) toInverse.push(den);
        Li[i + len] = Fr.div(num, den);
    }

    return Li;
}



function computeRi(f, toInverse, evals, roots, challengeY, challengeXi, w1_1d1, curve, addInverse, logger) {

    if(roots.length < 3) {
        let Li;
        if(roots.length === 1) {    
            let xi = challengeXi;
            for(let j = 0; j < f.openingPoints[0]; ++j) {
                xi = curve.Fr.mul(xi, w1_1d1);
            }
    
            Li = computeLagrangeSingleOpeningPoint(roots[0], toInverse, challengeY, xi, curve, addInverse);
        } else {    

            let xi0 = challengeXi;
            for(let j = 0; j < f.openingPoints[0]; ++j) {
                xi0 = curve.Fr.mul(xi0, w1_1d1);
            }
    
            let xi1 = challengeXi;
            for(let j = 0; j < f.openingPoints[1]; ++j) {
                xi1 = curve.Fr.mul(xi1, w1_1d1);
            }
    
            Li = computeLagrangeTwoOpeningPoints(roots, toInverse, challengeY, xi0, xi1, curve, addInverse);
        }
    
        const nPols = f.pols.length;
        const n = roots.length;
        const rootsRi = roots.flat();

        let res = curve.Fr.zero;
        for(let i = 0; i < nPols; ++i) {
            for(let k = 0; k < n; ++k) {
                let r = curve.Fr.one;
                let acc = curve.Fr.zero;
                for(let j = 0; j < nPols; ++j) {
                    acc = curve.Fr.add(acc, curve.Fr.mul(r, evals[j + k*nPols]));
                    r = curve.Fr.mul(r, rootsRi[i + k*nPols]); 
                }
                res = curve.Fr.add(res ,curve.Fr.mul(acc, Li[i + k*nPols]));
            }
        }

        return res;
    } else {
        const n = roots.length;
        const rootsRi = roots.flat();
        const nPols = f.pols.length;
        let fiValues = Array(n*nPols).fill(curve.Fr.zero);
        for(let j = 0; j < nPols; ++j) {
            for(let k = 0; k < n; ++k) {
                let r = curve.Fr.one;
                for(let l = 0; l < nPols; l++) {
                    fiValues[j + k*nPols] = curve.Fr.add(fiValues[j + k*nPols], curve.Fr.mul(r, evals[l + k*nPols]));
                    r = curve.Fr.mul(r, rootsRi[j + k*nPols]); 
                }
            }
        }

        if(addInverse) {
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

        // Interpolate a polynomial with the points computed previously
        const ri = Polynomial.lagrangePolynomialInterpolation(rootsRi, fiValues, curve);

        // Check the degree of ri(X) < degree
        if (ri.degree() > (n*nPols - 1)) {
            throw new Error(`R Polynomial is not well calculated. Ri has degree ${ri.degree()} while max degree is ${(n*nPols - 1)}`);
        }

        // Evaluate the polynomial in challenge Y
        if (logger) logger.info("··· Computing evaluation r1(y)");
        const evalRi = ri.evaluate(challengeY);  
        
        return evalRi;
    }
    
}

exports.computeRVerifier = function computeRVerifier(vk, toInverse, orderedEvals, roots, challengeY, challengeXi, curve, logger) {
    if(logger) logger.info("Computing R verifier");
    const r = [];
    let liNames = [];
    for(let i = 0; i < vk.f.length; ++i) {
        const evals = [];
        let addInverse = false;
        let wName = vk.f[i].openingPoints[0] === 0 ? `${vk.f[i].pols.length}_${vk.f[i].openingPoints.join("")}` : `${vk.f[i].pols.length}_${vk.f[i].openingPoints[0]}d${vk.f[i].pols.length}_${vk.f[i].openingPoints.join("")}`
        if(!liNames.includes(wName)) {
            liNames.push(wName);
            addInverse = true;
        }
        for(let j = 0; j < vk.f[i].openingPoints.length; ++j) {
            const wPower = vk.f[i].openingPoints[j] === 0 ? "" : vk.f[i].openingPoints[j] === 1 ? "w" : `w${vk.f[i].openingPoints[j]}`;
            evals.push(...vk.f[i].pols.map(fi => orderedEvals.find(e => e.name === fi + wPower).evaluation));
        } 

        const ri = computeRi(vk.f[i], toInverse, evals, roots[i], challengeY, challengeXi, vk.w1_1d1, curve, addInverse, logger);
        r.push(ri);
    }

    return r;
}



exports.calculateQuotients = function calculateQuotients(vk, toInverse, challengeY, challengeAlpha, roots, curve, logger) {
    if(logger) logger.info("Calculating quotients");
    const mulH = [];

    let dens = [];
    for(let i = 0; i < vk.f.length; ++i) {
        const rootsRi = roots[i].flat();
        let mulHi = curve.Fr.one;
        for (let k = 0; k < rootsRi.length; k++) {
            mulHi = curve.Fr.mul(mulHi, curve.Fr.sub(challengeY, rootsRi[k]));
        }
        let wName = vk.f[i].openingPoints[0] === 0 ? `${vk.f[i].pols.length}_${vk.f[i].openingPoints.join("")}` : `${vk.f[i].pols.length}_${vk.f[i].openingPoints[0]}d${vk.f[i].pols.length}_${vk.f[i].openingPoints.join("")}`; 
        if(i > 0 && !dens.includes(wName)) {
            dens.push(wName);
            toInverse.push(mulHi);
        }
        mulH.push(mulHi);

    }

    const nRoots = mulH.length;

    const quotients = new Array(nRoots).fill(curve.Fr.one);    
    quotients[0] = mulH[0];
    let challenge = challengeAlpha;
    for(let i = 1; i < nRoots; ++i) {
        quotients[i] = curve.Fr.mul(challenge, curve.Fr.div(mulH[0], mulH[i]));
        challenge = curve.Fr.mul(challenge, challengeAlpha);
    }

    return quotients;
}

exports.computeF = function computeF(f, quotients, curve, logger) {
    if(logger) logger.info("Computing F");
    const G1 = curve.G1;
    
    let F = f[0];
    for(let i = 1; i < f.length; ++i) {
        const Fi = G1.timesFr(f[i], quotients[i]);
        F = G1.add(F, Fi);
    }

    return F;
}

exports.computeE = function computeE(r, quotients, curve, logger) {
    if(logger) logger.info("Computing E");
    const G1 = curve.G1;
    
    let E = r[0];
    for(let i = 1; i < r.length; ++i) {
        const Ei = curve.Fr.mul(r[i], quotients[i]);
        E = curve.Fr.add(E, Ei);
    }

    return G1.timesFr(G1.one, E);
}


exports.computeJ = function computeJ(W, quotient0, curve, logger) {
    if(logger) logger.info("Computing J");
    const G1 = curve.G1;

    return G1.timesFr(W, quotient0);
}


exports.isValidPairing = async function isValidPairing(vk, Wp, challengeY, F, E, J, curve, logger) {
    if(logger) logger.info("Verifying pairing");
    const G1 = curve.G1;

    const A1 = G1.add(G1.sub(G1.sub(F, E), J), G1.timesFr(Wp, challengeY));
    const A2 = curve.G2.one;

    const B1 = Wp;
    const B2 = vk.X_2;

    return curve.pairingEq(G1.neg(A1), A2, B1, B2);
}

