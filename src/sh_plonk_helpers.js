import { BigBuffer } from "ffjavascript";
import {Keccak256Transcript} from "./Keccak256Transcript.js";
import { log2 } from "./polynomial/misc.js";
import { Polynomial } from "./polynomial/polynomial.js";

export function computeChallengeAlpha(xiSeed, orderedEvals, curve, logger) {
      
    const transcript = new Keccak256Transcript(curve);

    for(let i = 0; i < orderedEvals.length; ++i) {
        transcript.addScalar(orderedEvals[i].evaluation);
    }
    transcript.addScalar(xiSeed);

    const challengesAlpha = transcript.getChallenge();
    if (logger) logger.info("> challenges Alpha: " + curve.Fr.toString(challengesAlpha));

    return challengesAlpha;
}

export function computeChallengeY(W, challengeAlpha, curve, logger) {
    const transcript = new Keccak256Transcript(curve);
    transcript.addScalar(challengeAlpha);
    transcript.addPolCommitment(W);

    const challengesY = transcript.getChallenge();
    if (logger) logger.info("> challenges Y: " + curve.Fr.toString(challengesY));

    return challengesY;
}




function calculateRootsFi(initialOmega, initialValue, degFi, lcm, xiSeed, curve, logger) {
    const wPower = [];
    wPower[0] = curve.Fr.one;
    for (let i = 1; i < degFi; i++) {
        wPower[i] = curve.Fr.mul(wPower[i - 1], initialOmega);
    }

    const S = [];
    S[0] = initialValue;

    if (lcm % degFi !== 0) throw new Error();

    for(let i = 0; i < lcm/degFi; ++i) {
        S[0] = curve.Fr.mul(S[0], xiSeed);
    }

    
    for (let i = 1; i < degFi; i++) {
        S[i] = curve.Fr.mul(S[0], wPower[i]);
    }

    return S;
}

export function calculateRoots(f, xiSeed, zkey, curve, logger) {

    const roots = [];
    for(let i = 0; i < f.length; ++i) {
        const rootsFi = [];
        const nPols = f[i].pols.length;
        const initialOmega = zkey[`w${nPols}`];
        for(let k = 0; k < f[i].openingPoints.length; ++k) {
            const initValue = f[i].openingPoints[k] === 0 ? curve.Fr.one : zkey[`w${nPols}_${f[i].openingPoints[k]}d${nPols}`];
            const rootWi = calculateRootsFi(initialOmega, initValue, nPols, zkey.powerW, xiSeed, curve, logger);
            rootsFi.push(rootWi);    
        }
        roots.push(rootsFi);
    }

    return roots;
}



export function getOrderedEvals(f, evaluations) {
    const orderedEvals = [];
    for(let i = 0; i < f.length; i++) {
        let evalsI = [];
        for(let k = 0; k < f[i].openingPoints.length; k++) {
            const wPower = f[i].openingPoints[k] === 0 ? "" : f[i].openingPoints[k] === 1 ? "w" : `w${f[i].openingPoints[k]}`;
            for(let l = 0; l < f[i].pols.length; ++l) {
                const evalName = f[i].pols[l] + wPower;
                const ev = {name: evalName};
                if(evaluations) {
                    ev.evaluation = evaluations[evalName];
                }
                evalsI.push(ev);
            }
        }
        orderedEvals.push(...evalsI);
    }

    return orderedEvals;
}


export function sumCommits(commits, curve, logger) {
    let commit = curve.G1.zeroAffine;
    for(let i = 0; i < commits.length; ++i) {
        commit = curve.G1.add(commit, commits[i]); 
    }

    return curve.G1.toAffine(commit);
}  

export function sumPolynomials(polynomials, curve, logger) {
    if(polynomials.length === 1) return polynomials[0];
    let degrees = polynomials.map(p => p === undefined ? 0 : p.degree());
    let maxDegree = Math.max(...degrees);

    const lengthBuffer = 2 ** (log2(maxDegree) + 1);

    const sFr = curve.Fr.n8;

    let polynomial = new Polynomial(new BigBuffer(lengthBuffer * sFr), curve, logger);

    for (let i = 0; i <= maxDegree; i++) {
        const i_n8 = i * sFr;
        let coef = curve.Fr.zero;
        for (let j = 0; j < polynomials.length; j++) {
            if (polynomials[j] !== undefined && polynomials[j].degree() > 0 && i <= polynomials[j].degree()) {
                coef = curve.Fr.add(coef, polynomials[j].coef.slice(i_n8, i_n8 + sFr));
            }
        }
        polynomial.coef.set(coef, i_n8);
    }

    return polynomial;
}

