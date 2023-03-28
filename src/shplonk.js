const { calculateRoots, computeChallengeAlpha, computeChallengeXiSeed, computeChallengeY, getOrderedEvals, addCommitsF } = require("./helpers/helpers.js");
const { calculateEvaluations, computeR, computeW, computeWp, getMontgomeryBatchedInverse } = require("./helpers/prover.js");
const { calculateQuotients, computeE, computeF, computeJ, computeRVerifier, isValidPairing } = require("./helpers/verifier.js");
const { lcm } = require("./utils.js");
const { computeRootWi, computeWi, getFByStage, getFByOpeningPoints, getPowersOfTau, getPowersW } = require("./helpers/setup.js");
const {CPolynomial} = require("./polynomial/cpolynomial.js");

module.exports.setup = async function setup(config, ptauFilename, logger) {
    //fi polynomials can only be created either by stage or by opening points.
    if(!["stage", "openingPoints"].includes(config.openBy)) throw new Error(`${config.openBy} is not valid. You can only openBy polynomials by "stage" or "openingPoints".`);
    
    // Given a config, calculate the fi composed polynomials that will be used in the protocol
    const f = config.openBy === "stage" ? getFByStage(config) : getFByOpeningPoints(config);

    // Currently, the base case in which only one fi is provided is not supported
    if(f.length === 1) throw new Error("Need to provide at least to fi.");

    // Get all the different generators needed in the protocol 
    const wPowers = getPowersW(f);

    // Calculate the Powers of Tau (checking its validity first) and store it along with X_2, which will be needed for the verifier
    const {PTau, X_2, curve} = await getPowersOfTau(f, ptauFilename, config.power);

    const zkey = {
        power: config.power,
        f,
        X_2,
    };

    // Compute each of the generators and the corresponding kth-roots and add it to the zkey
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

    return {zkey, PTau, curve};
}


module.exports.commit = async function commit(stage, pk, polynomials, PTau, multiExp, curve, logger) {
    if (logger) logger.info(`> Commiting polynomials for stage ${stage}`);

    // Sort f by index
    pk.f.sort((a, b) => a - b);

    // Get all the polynomials that are being committed at the stage provided
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
        // Get for each fi that needs to be committed the polynomials that are committed in the current stage
        const cPols = fPolsToCommit[i].stages.find(s => s.stage === stage).pols;

        // Initialize the fi composed polynomial. Keep in mind that maybe not all the polynomials are provided in the same stage 
        const fPol = new CPolynomial(fPolsToCommit[i].pols.length, curve, logger);
        for(let j = 0; j < cPols.length; ++j) {

            // Check that each polynomial is provided and have the degree specified in the config
            if(!polynomials[cPols[j].name]) throw new Error(`Polynomial ${cPols[j].name} is not provided`);
            if(polynomials[cPols[j].name].degree() > cPols[j].degree) {
                throw new Error(`Polynomial ${cPols[j].name} degree (${polynomials[cPols[j].name].degree()}) doesn't match with the one specified in the config (${cPols[j].degree})`); 
            }
            // Get the position in the composed polynomial of the current pol and add it.
            const pos = fPolsToCommit[i].pols.indexOf(cPols[j].name);
            fPol.addPolynomial(pos, polynomials[cPols[j].name]);
        }

        // The index is composed by the ith f polynomial and the stage. It is done this way because, if polynomials corresponding
        // to fi are provided in different stages, this pols and commits will need to be added together when opening and verifying
        // and this is the easiest way to track it.
        const index = `f${fPolsToCommit[i].index}_${stage}`;
        const pol = fPol.getPolynomial();

        // Check that the composed polynomial has been calculated properly
        if(pol.degree() > fPolsToCommit[i].degree) throw new Error(`Polynomial ${fPolsToCommit[i].index} was not properly calculated`);

        pols[i] = {pol, index};
    }

    if(multiExp) {
        if (logger) logger.info(`> Computing multiExponentiation for stage ${stage}`);
        for(let i = 0; i < pols.length; ++i) {
            //Store the multiexponentiation evaluation in a promise array, which will be solved after the loop ends
            promises.push(pols[i].pol.multiExponentiation(PTau));
        }
    
        const commits = await Promise.all(promises);
    
        // Add the commits to the pols array
        for(let i = 0; i < commits.length; ++i) {
            pols[i].commit = commits[i];
        }
    }

    return pols;
}


module.exports.open = async function open(pk, PTau, polynomials, committedPols, curve, options = {  }) {

    const logger = options.logger;
    
    if (logger) logger.info(`> Opening polynomials and calculating W, Wp`);

    // Sort f by index
    pk.f.sort((a, b) => a - b);

    // Store all the committed polynomials and its commits to its corresponding fi
    addCommitsF(pk.f, committedPols, true, curve);

    const commits = {};
    for(let i = 0; i < pk.f.length; ++i) {
        commits[`f${pk.f[i].index}`] = pk.f[i].commit;
    }

    // Calculate the xiSeed from all the committed polynomials
    const xiSeed = options.xiSeed ? curve.Fr.e(options.xiSeed) : computeChallengeXiSeed(pk.f.sort((a,b) => a.index > b.index ? 1 : -1).map(fi => fi.commit), curve);

    const nonCommittedPols = options.nonCommittedPols ? options.nonCommittedPols : [];
    
    // Calculate the roots of all the fi
    const roots = calculateRoots(pk, xiSeed, curve, logger);

    // Given the xiSeed and polynomials, calculate the opening points and all the evaluations
    const {evaluations, openingPoints} = calculateEvaluations(pk, polynomials, xiSeed, curve, logger);

    // Order the evaluations. It is important to keep this order to then be consistant with the solidity verifier
    const orderedEvals = getOrderedEvals(pk.f, evaluations);

    // Calculate challenge alpha using all the evaluations
    const challengeAlpha = computeChallengeAlpha(xiSeed, orderedEvals, nonCommittedPols, curve, logger);

    // Calculate all the ri polinomials
    const r = await computeR(pk.f, roots, curve, logger);

    // Calculate W
    const W = computeW(pk.f, r, roots, challengeAlpha, openingPoints, curve, logger);
    const commitW = await W.multiExponentiation(PTau);
    commits.W = commitW;

    // Calculate challenge Y from W commit
    const challengeY = computeChallengeY(commitW, challengeAlpha, curve, logger);


    // Calculate Wp
    const Wp = computeWp(pk.f, r, roots, W, challengeY, challengeAlpha, curve, logger);
    const commitWp = await Wp.multiExponentiation(PTau);
    commits.Wp = commitWp;

    // Add the montgomery batched inverse, which is used to calculate the inverses in 
    // the Solidity verifier, to the evaluations
    evaluations.inv = getMontgomeryBatchedInverse(pk, roots, challengeY, curve, logger);

    // Return W, Wp, the polynomials evaluations, the xiSeed and the opening points
    return [commits, evaluations, xiSeed];
}

module.exports.verifyOpenings = async function verifyOpenings(vk, commits, evaluations, curve, options = {}) {
    
    const logger = options.logger;

    // Sort f by index
    vk.f.sort((a, b) => a - b);

    // Store the polynomial commits to its corresponding fi
    for(let i = 0; i < vk.f.length; ++i) {
        if(!commits[`f${vk.f[i].index}`]) throw new Error(`f${vk.f[i].index} commit is missing`);
        vk.f[i].commit = commits[`f${vk.f[i].index}`];
    }

    // Calculate the xiSeed from all the committed polynomials
    const xiSeed =  options.xiSeed ? curve.Fr.e(options.xiSeed) : computeChallengeXiSeed(vk.f.sort((a,b) => a.index > b.index ? 1 : -1).map(fi => fi.commit), curve);

    const nonCommittedPols = options.nonCommittedPols ? options.nonCommittedPols : [];

    // Order the evaluations. It is important to keep this order to then be consistant with the solidity verifier
    const orderedEvals = getOrderedEvals(vk.f, evaluations);

    // Calculate challenge alpha using all the evaluations
    const challengeAlpha = computeChallengeAlpha(xiSeed, orderedEvals, nonCommittedPols, curve, logger);

    // Calculate the roots of all the fi
    const roots = calculateRoots(vk, xiSeed, curve, logger);

    // Calculate challenge Y from W commit
    const challengeY = computeChallengeY(commits.W, challengeAlpha, curve, logger);
    
    // Calculate the evaluation of each ri at challengeY
    const r = computeRVerifier(vk.f, orderedEvals, roots, challengeY, curve, logger);

    // Calculate quotients of the roots so that it is easier to calculate F and E
    const quotients = calculateQuotients(challengeY, challengeAlpha, roots, curve, logger);

    // In order to verify the openings, the following calculation needs to be computed: e([F]_1 - [E] - [J] + y[W'], [1]) = e([W'], [x]);

    // Calculate F
    const F = computeF(vk.f.map(fi => fi.commit), quotients, curve, logger);

    // Calculate E
    const E = computeE(r, quotients, curve, logger);

    // Calculate J
    const J = computeJ(commits.W, quotients[0], curve, logger);

    // Check that the pairing is valid
    const res = await isValidPairing(vk, commits.Wp, challengeY, F, E, J, curve, logger);

    if (logger) {
        if (res) {
            logger.info("Openings verified successfully");
        } else {
            logger.warn("Invalid Openings");
        }
    }

    return res;
}
