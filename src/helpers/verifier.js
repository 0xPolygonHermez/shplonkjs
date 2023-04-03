const {Polynomial} = require("../polynomial/polynomial.js");
const {Scalar} = require("ffjavascript");

function computeLagrangeLiSi(roots, x, xi, curve) {
    const Fr = curve.Fr;
    const len = roots.length;
    
    if(len === 1) return [curve.Fr.one];
    const num = Fr.sub(Fr.exp(x, len), xi);
    const den1 = Fr.mul(Fr.e(len), Fr.exp(roots[0], len - 2));
    
    const Li = [];
    for (let i = 0; i < len; i++) {
        const den2 = roots[((len - 1) * i) % len];
        const den3 = Fr.sub(x, roots[i]);

        Li[i] = Fr.div(num, Fr.mul(Fr.mul(den1, den2), den3));
    }

    return Li;
}


function computeRi(f, evals, roots, challengeY, challengeXi, curve, logger) {

    if(roots.length === 1) {
        const rootsRi = roots.flat();

        const Li = computeLagrangeLiSi(rootsRi, challengeY, challengeXi, curve);

        const nPols = f.pols.length;
        let res = curve.Fr.zero;
        for(let i = 0; i < nPols; ++i) {
            let r = curve.Fr.one;
            let acc = curve.Fr.zero;
            for(let j = 0; j < nPols; ++j) {
                acc = curve.Fr.add(acc, curve.Fr.mul(r, evals[j]));
                r = curve.Fr.mul(r, rootsRi[i]); 
            }
            res = curve.Fr.add(res ,curve.Fr.mul(acc, Li[i]));
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

exports.computeRVerifier = function computeRVerifier(vk, orderedEvals, roots, challengeY, challengeXi, curve, logger) {
    const r = [];
    for(let i = 0; i < vk.f.length; ++i) {
        const evals = [];
        for(let j = 0; j < vk.f[i].openingPoints.length; ++j) {
            const wPower = vk.f[i].openingPoints[j] === 0 ? "" : vk.f[i].openingPoints[j] === 1 ? "w" : `w${vk.f[i].openingPoints[j]}`;
            evals.push(...vk.f[i].pols.map(fi => orderedEvals.find(e => e.name === fi + wPower).evaluation));
        }
        let xi = challengeXi;
        for(let j = 0; j < vk.f[i].openingPoints[0]; ++j) {
            xi = curve.Fr.mul(xi, vk.w1_1d1);
        }
        const ri = computeRi(vk.f[i], evals, roots[i], challengeY, xi, curve, logger);
        r.push(ri);
    }

    return r;
}



exports.calculateQuotients = function calculateQuotients(challengeY, challengeAlpha, roots, curve, logger) {
    if(logger) logger.info("Calculating quotients");
    const mulH = [];

    for(let i = 0; i < roots.length; ++i) {
        const rootsRi = roots[i].flat();
        let mulHi = curve.Fr.one;
        for (let k = 0; k < rootsRi.length; k++) {
            mulHi = curve.Fr.mul(mulHi, curve.Fr.sub(challengeY, rootsRi[k]));
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

