import {Polynomial} from "../polynomial/polynomial.js";


function computeRi(f, evals, roots, challengeY, curve, logger) {
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

    // Evaluate the polynomial in challenges.y
    if (logger) logger.info("··· Computing evaluation r1(y)");
    const evalRi = ri.evaluate(challengeY);  
    
    return evalRi;
}

export function computeR(f, orderedEvals, roots, challengeY, curve, logger) {
    const r = [];
    for(let i = 0; i < f.length; ++i) {
        const evals = [];
        for(let j = 0; j < f[i].openingPoints.length; ++j) {
            const wPower = f[i].openingPoints[j] === 0 ? "" : f[i].openingPoints[j] === 1 ? "w" : `w${f[i].openingPoints[j]}`;
            evals.push(...f[i].pols.map(fi => orderedEvals.find(e => e.name === fi + wPower).evaluation));
        }
        const ri = computeRi(f[i], evals, roots[i], challengeY, curve, logger);
        r.push(ri);
    }

    return r;
}



export function calculateQuotients(challengeY, challengeAlpha, roots, curve, logger) {
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

export function computeF(f, quotients, curve, logger) {
    if(logger) logger.info("Computing F");
    const G1 = curve.G1;
    
    let F = f[0];
    for(let i = 1; i < f.length; ++i) {
        const Fi = G1.timesFr(f[i], quotients[i]);
        F = G1.add(F, Fi);
    }

    return F;
}

export function computeE(r, quotients, curve, logger) {
    if(logger) logger.info("Computing E");
    const G1 = curve.G1;
    
    let E = r[0];
    for(let i = 1; i < r.length; ++i) {
        const Ei = curve.Fr.mul(r[i], quotients[i]);
        E = curve.Fr.add(E, Ei);
    }

    return G1.timesFr(G1.one, E);
}

export function computeJ(W, quotient, curve, logger) {
    if(logger) logger.info("Computing J");
    const G1 = curve.G1;

    return G1.timesFr(W, quotient);
}


export async function isValidPairing(vk, Wp, challengeY, F, E, J, curve, logger) {
    if(logger) logger.info("Verifying pairing");
    const G1 = curve.G1;

    const A1 = G1.add(G1.sub(G1.sub(F, E), J), G1.timesFr(Wp, challengeY));
    const A2 = curve.G2.one;

    const B1 = Wp;
    const B2 = vk.X_2;

    return curve.pairingEq(G1.neg(A1), A2, B1, B2);
}

