import { calculateRoots, computeChallengeAlpha, computeChallengeY, getOrderedEvals } from "./sh_plonk_helpers.js";
import { calculateEvaluations, computeR, computeW, computeWp, getMontgomeryBatchedInverse } from "./sh_plonk_helpers_prover.js";
import { calculateQuotients, computeE, computeF, computeJ, computeR as computeRVerifier, isValidPairing } from "./sh_plonk_helpers_verifier.js";
import { CPolynomial } from "./polynomial/cpolynomial.js";
import { lcm } from "./utils.js";
import { readBinFile } from "@iden3/binfileutils";
import * as utils from "./powersoftau_utils.js";
import { BigBuffer } from "ffjavascript";
import { computeRootWi, computeWi, getF, getPowersOfTau } from "./sh_plonk_helpers_setup.js";

/*

precomputedPols a buffer with the prepocmputed posl row major.
The degree must be the same for all precomputed pols and the size of the buffer must match

Returns: [pk, vk]  Returns public key and verification key

*/

export async function setup(config, curve, ptauFilename, logger) {
    
    const f = getF(config);

    const wPowers = {};
    for(let i = 0; i < f.length; ++i) {
        let fi = f[i];
        for(let i = 0; i < fi.openingPoints.length; ++i) {
            if(!wPowers[fi.pols.length]) {
                wPowers[fi.pols.length] = [fi.openingPoints[i]];
            } else {
                if(!wPowers[fi.pols.length].includes(fi.openingPoints[i])) {
                    wPowers[fi.pols.length].push(fi.openingPoints[i]);
                }
            }
        }
    }

    const powerW = lcm(Object.keys(wPowers));
    
    const zkey = {
        powerW,
        power: config.power,
        nOpeningPoints: config.polDefs.length,
        f,
    };

    for(let i = 0; i < Object.keys(wPowers).length; ++i) {
        const deg = Object.keys(wPowers)[i];
        zkey[`w${deg}`] = computeWi(deg, curve, logger);

        const ws = wPowers[Object.keys(wPowers)[i]].sort();
        for(let j = 0; j < ws.length; ++j) {
            if(ws[j] > 0) {
                zkey[`w${deg}_${ws[j]}d${deg}`] = computeRootWi(deg, ws[j], config.power, curve, logger);
            }
        }
    }

    const {PTau, X_2} = await getPowersOfTau(f, ptauFilename, config.power, curve);
    zkey.X_2 = X_2;

    return {zkey, PTau};
}

/*
    Returns a list of commits
*/ 
export async function commit(stage, pk, polsNames, ctx, PTau, curve, logger) {

    const f = pk.f;
    
    const fPolsToCommit = [];
    for(let i = 0; i < f.length; ++i) {
        for(let j = 0; j < f[i].pols.length; ++j) {
            if(polsNames.includes(f[i].pols[j])) {
                fPolsToCommit.push(f[i]);
                break;
            }
        }
    }

    const pols = [];
    const promises = [];
    for(let i = 0; i < fPolsToCommit.length; ++i) {
        const cPols = fPolsToCommit[i].pols;
        const fPol = new CPolynomial(cPols.length, curve, logger);
        for(let j = 0; j < cPols.length; ++j) {
            if(polsNames.includes(cPols[j])) {
                if(!ctx[cPols[j]]) throw new Error(`Polynomial ${cPols[j]} is not provided`);
                fPol.addPolynomial(j, ctx[cPols[j]]);
            }
        }
        const index = fPolsToCommit[i].index;
        const pol = fPol.getPolynomial();

        if(pol.degree() > fPolsToCommit[i].degree) throw new Error(`Polynomial f${fPolsToCommit[i].index} was not properly calculated`);

        pols[i] = {pol, index};

        ctx[`f${fPolsToCommit[i].index}`] = pol;
        promises.push(pol.multiExponentiation(PTau));
    }

    const commits = await Promise.all(promises);

    for(let i = 0; i < commits.length; ++i) {
        pols[i].commit = commits[i];
    }

    return pols;
}

/*
    openings is the list of opening points
    returns W,W' and evaluations
*/
export async function open(xiSeed, pk, PTau, ctx, committedPols, curve, logger) {
    // Get all the committed polynomials

    const f = pk.f;
 
    for(let i = 0; i < f.length; ++i) {
        if(!committedPols[`f${f[i].index}`]) throw new Error(`f${f[i].index} commit is missing`);
        if(!ctx[`f${f[i].index}`]) throw new Error(`f${f[i].index} polynomial is missing`);
        f[i].commit = committedPols[`f${f[i].index}`];
        f[i].pol = ctx[`f${f[i].index}`];
    }

    // Calculate roots
    const roots = calculateRoots(f, xiSeed, pk, curve, logger);

    const {evaluations, openingPoints} = calculateEvaluations(pk, ctx, f, xiSeed, curve, logger);

    const orderedEvals = getOrderedEvals(f, evaluations);

    // Calculate challenge alpha using all the evaluations
    const challengeAlpha = computeChallengeAlpha(xiSeed, orderedEvals, curve, logger);

    // Calculate R
    const r = await computeR(f, roots, curve, logger);

    // Calculate W
    const W = computeW(f, r, roots, challengeAlpha, openingPoints, curve, logger);
    const commitW = await W.multiExponentiation(PTau);

    // Calculate challenge Y from W commit
    const challengesY = computeChallengeY(commitW, challengeAlpha, curve, logger);

    const toInverse = [];

    // Calculate Wp
    const L = computeWp(f, r, roots, W, challengesY, challengeAlpha, toInverse, curve, logger);
    const commitW2 = await L.multiExponentiation(PTau);
    
    evaluations.inv = getMontgomeryBatchedInverse(roots, toInverse, curve, logger);

    // Return W, Wp and the evaluations
    return [commitW, commitW2, evaluations, openingPoints];
}

export async function verifyOpenings(vk, xiSeed, committedPols, evaluations, curve, logger) {
    
    const W = committedPols.W1;
    const Wp = committedPols.W2;

    const f = vk.f;

    for(let i = 0; i < f.length; ++i) {
        f[i].commit = committedPols[`f${f[i].index}`];
    }

    const orderedEvals = getOrderedEvals(f, evaluations);

    // Calculate challenge alpha using all the evaluations
    const challengeAlpha = computeChallengeAlpha(xiSeed, orderedEvals, curve, logger);

    const roots = calculateRoots(f, xiSeed, vk, curve, logger);

    // Calculate challenge Y from W commit
    const challengeY = computeChallengeY(W, challengeAlpha, curve, logger);
    
    const r = computeRVerifier(f, orderedEvals, roots, challengeY, curve, logger);

    // Calculate quotients of the roots so that it is easier to calculate F and E
    const quotients = calculateQuotients(challengeY, challengeAlpha, roots, curve, logger);

    // In order to verify the openings, the following calculation needs to be computed: e([F] - [E] - [J] + y[W], [1]) = e([W'], [x]);

    // Calculate F
    const F = computeF(f.map(fi => fi.commit), quotients, curve, logger);

    // Calculate E
    const E = computeE(r, quotients, curve, logger);

    // Calculate J
    const J = computeJ(W, quotients[0], curve, logger);

    // Check that the pairing is valid
    const res = await isValidPairing(vk, Wp, challengeY, F, E, J, curve, logger);

    if (logger) {
        if (res) {
            logger.info("Openings verified successfully");
        } else {
            logger.warn("Invalid Openings");
        }
    }

    return res;
}
