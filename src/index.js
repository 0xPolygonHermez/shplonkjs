import { calculateRoots, computeChallengeAlpha, computeChallengeXiSeed, computeChallengeY, getOrderedEvals, sumCommits, sumPolynomials } from "./helpers/helpers.js";
import { calculateEvaluations, computeR, computeW, computeWp, getMontgomeryBatchedInverse } from "./helpers/prover.js";
import { calculateQuotients, computeE, computeF, computeJ, computeR as computeRVerifier, isValidPairing } from "./helpers/verifier.js";
import { CPolynomial } from "./polynomial/cpolynomial.js";
import { lcm } from "./utils.js";
import { computeRootWi, computeWi, getFByStage, getFByOpeningPoints, getPowersOfTau } from "./helpers/setup.js";

/*
    
*/
export async function setup(config, curve, ptauFilename, logger) {
    
    // Given a config, calculate the fi composed polynomials that will be used in the protocol
    if(!["stage", "openingPoints"].includes(config.split)) throw new Error(`${config.split} is not valid. You can only split polynomials by "stage" or "openingPoints".`);
    const f = config.split === "stage" ? getFByStage(config, curve) : getFByOpeningPoints(config, curve);

    if(f.length === 1) throw new Error("Currently the case with a single fi is not supported.");

    // Get the definition of all the different generators (order and opening points) for each of the fi
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

    // Compute least common multiple of the order of all the generators
    const powerW = lcm(Object.keys(wPowers));
    
    const zkey = {
        powerW,
        power: config.power,
        nOpeningPoints: config.polDefs.length,
        f,
    };

    // Compute each of the generators and roots and add it to the zkey
    for(let i = 0; i < Object.keys(wPowers).length; ++i) {
        const deg = Number(Object.keys(wPowers)[i]);
        zkey[`w${deg}`] = computeWi(deg, curve, logger);

        const ws = wPowers[Object.keys(wPowers)[i]].sort();
        for(let j = 0; j < ws.length; ++j) {
            if(ws[j] > 0) {
                zkey[`w${deg}_${ws[j]}d${deg}`] = computeRootWi(deg, ws[j], config.power, curve, logger);
            }
        }
    }

    // Check that Powers of Tau is valid and store it along with X_2, which will be needed for the verifier
    const {PTau, X_2} = await getPowersOfTau(f, ptauFilename, config.power, curve);
    zkey.X_2 = X_2;

    return {zkey, PTau};
}


export async function commit(stage, pk, ctx, PTau, curve, logger) {

    // Get all the polynomials that are being committed by checking each fi definition
    // and the polsNames list provided by the user
    const fPolsToCommit = [];
    for(let i = 0; i < pk.f.length; ++i) {
        const polsStage = pk.f[i].stages.find(s => s.stage === stage);
        if(polsStage) {
            fPolsToCommit.push(pk.f[i]);
        }
    }

    const pols = [];
    const promises = [];
    // Create the composed polynomial for each of the polynomials to commit
    for(let i = 0; i < fPolsToCommit.length; ++i) {
        const cPols = fPolsToCommit[i].stages.find(s => s.stage === stage).pols;
        const fPol = new CPolynomial(fPolsToCommit[i].pols.length, curve, logger);
        for(let j = 0; j < cPols.length; ++j) {
            if(!ctx[cPols[j]]) throw new Error(`Polynomial ${cPols[j]} is not provided`);
            const pos = fPolsToCommit[i].pols.indexOf(cPols[j]);
            fPol.addPolynomial(pos, ctx[cPols[j]]);
        }
        // The index is composed by the ith f polynomial and the stage. It is done this way because, if polynomials corresponding
        // to fi are provided in different stages, this pols and commits will need to be added together when opening and verifying
        // and this is the easiest way to track it.
        const index = `${fPolsToCommit[i].index}_${stage}`;
        const pol = fPol.getPolynomial();

        // Check that the composed polynomial has been calculated properly
        if(pol.degree() > fPolsToCommit[i].degree) throw new Error(`Polynomial f${fPolsToCommit[i].index} was not properly calculated`);

        pols[i] = {pol, index};

        //Store the multiexponentiation evaluation in a promise array, which will be solved after the loop ends
        promises.push(pol.multiExponentiation(PTau));
    }

    const commits = await Promise.all(promises);

    // Add the commits to the pols array
    for(let i = 0; i < commits.length; ++i) {
        pols[i].commit = commits[i];
    }

    return pols;
}


export async function open(pk, PTau, ctx, committedPols, curve, logger) {
    // Store all the committed polynomials to its corresponding fi
    // If the composed polynomial was split in several stages, sum the polynomial and the commits to obtain the final fi
    for(let i = 0; i < pk.f.length; ++i) {
        const commits = [];
        const pols = [];
        for(let j = 0; j < pk.f[i].stages.length; ++j) {
            const index = `${pk.f[i].index}_${pk.f[i].stages[j].stage}`;
            if(!committedPols[`f${index}`]) throw new Error(`f${index} not found`); 
            if(!committedPols[`f${index}`].commit) throw new Error(`f${index} commit is missing`);
            if(!committedPols[`f${index}`].pol) throw new Error(`f${index} polynomial is missing`);
            commits.push(committedPols[`f${index}`].commit);
            pols.push(committedPols[`f${index}`].pol);
        }
        pk.f[i].commit = sumCommits(commits, curve, logger);
        pk.f[i].pol = sumPolynomials(pols, curve, logger); 
    }

    const xiSeed = computeChallengeXiSeed(pk.f, curve);

    // Calculate the roots
    const roots = calculateRoots(pk, xiSeed, curve, logger);

    // Given the xiSeed and ctx polynomials, calculate the opening points and all the evaluations
    const {evaluations, openingPoints} = calculateEvaluations(pk, ctx, xiSeed, curve, logger);

    // Order the evaluations by usage in the fi. It is important to use this order since it is the one 
    // that the solidity verifier is gonna use
    const orderedEvals = getOrderedEvals(pk.f, evaluations);

    // Calculate challenge alpha using all the evaluations
    const challengeAlpha = computeChallengeAlpha(xiSeed, orderedEvals, curve, logger);

    // Calculate R
    const r = await computeR(pk.f, roots, curve, logger);

    // Calculate W
    const W = computeW(pk.f, r, roots, challengeAlpha, openingPoints, curve, logger);
    const commitW = await W.multiExponentiation(PTau);

    // Calculate challenge Y from W commit
    const challengeY = computeChallengeY(commitW, challengeAlpha, curve, logger);

    // Define an array to store the inverses that will be calculated in the solidity verifier
    const toInverse = [];

    // Calculate Wp
    const Wp = computeWp(pk.f, r, roots, W, challengeY, challengeAlpha, toInverse, curve, logger);
    const commitW2 = await Wp.multiExponentiation(PTau);
    
    evaluations.inv = getMontgomeryBatchedInverse(roots, toInverse, curve, logger);

    // Return W, Wp and the evaluations
    return [commitW, commitW2, evaluations, openingPoints, xiSeed];
}

export async function verifyOpenings(vk, committedPols, evaluations, curve, logger) {
    
    const W = committedPols.W1.commit;
    const Wp = committedPols.W2.commit;

    for(let i = 0; i < vk.f.length; ++i) {
        const commits = [];
        for(let j = 0; j < vk.f[i].stages.length; ++j) {
            const index = `${vk.f[i].index}_${vk.f[i].stages[j].stage}`;
            if(!committedPols[`f${index}`]) throw new Error(`f${index} not found`); 
            if(!committedPols[`f${index}`].commit) throw new Error(`f${index} commit is missing`);
            commits.push(committedPols[`f${index}`].commit);
        }
        vk.f[i].commit = sumCommits(commits, curve, logger);

    }

    const xiSeed = computeChallengeXiSeed(vk.f, curve);

    // Order the evaluations by usage in the fi. It is important to use this order since it is the one 
    // that the solidity verifier is gonna use
    const orderedEvals = getOrderedEvals(vk.f, evaluations);

    // Calculate challenge alpha using all the evaluations
    const challengeAlpha = computeChallengeAlpha(xiSeed, orderedEvals, curve, logger);

    // Calculate the roots
    const roots = calculateRoots(vk, xiSeed, curve, logger);

    // Calculate challenge Y from W commit
    const challengeY = computeChallengeY(W, challengeAlpha, curve, logger);
    
    const r = computeRVerifier(vk.f, orderedEvals, roots, challengeY, curve, logger);

    // Calculate quotients of the roots so that it is easier to calculate F and E
    const quotients = calculateQuotients(challengeY, challengeAlpha, roots, curve, logger);

    // In order to verify the openings, the following calculation needs to be computed: e([F] - [E] - [J] + y[W], [1]) = e([W'], [x]);

    // Calculate F
    const F = computeF(vk.f.map(fi => fi.commit), quotients, curve, logger);

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
