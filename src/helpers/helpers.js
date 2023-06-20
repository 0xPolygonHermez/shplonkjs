const {BigBuffer} = require("ffjavascript");
const {Keccak256Transcript} = require("../Keccak256Transcript.js");
const {Polynomial} = require("../polynomial/polynomial.js");
const {log2} = require("../utils.js");

/**
 * Compute xiSeed, which is used to compute all the roots
 * It contains all the committed polynomials
 */
module.exports.computeChallengeXiSeed = function computeChallengeXiSeed(commits, curve, options) {

    const logger = options.logger;

        
    // Initialize new transcript
    const transcript = new Keccak256Transcript(curve);

    if(options.fflonkPreviousChallenge) {
        transcript.addScalar(options.fflonkPreviousChallenge);
        commits = commits.filter(c => c.stages[0].stage !== 0);
    }

    const commitsValues = commits.map(c => c.commit);
    
    // Add all commits to the transcript
    for(let i = 0; i < commitsValues.length; ++i) {
        transcript.addPolCommitment(commitsValues[i]);
    }

    // Calculate the challenge
    const challengeXiSeed = transcript.getChallenge();
    if (logger) logger.info("> challenge xiSeed: " + curve.Fr.toString(challengeXiSeed));

    return challengeXiSeed;
}

/**
 * Compute challenge alpha, which is used to compute W
 * It contains the previous challenge (xiSeed) and all the evaluations
 */
module.exports.computeChallengeAlpha = function computeChallengeAlpha(xiSeed, orderedEvals, nonCommittedPols, curve, logger) {
    // Initialize new transcript
    const transcript = new Keccak256Transcript(curve);

    // Add previous challenge xiSeed to the config
    transcript.addScalar(xiSeed);

    // Add all the ordered evals to the transcript
    for(let i = 0; i < orderedEvals.length; ++i) {
        if(!nonCommittedPols.includes(orderedEvals[i].name)) {
            transcript.addScalar(orderedEvals[i].evaluation);
        }
    }

    // Calculate the challenge
    const challengeAlpha = transcript.getChallenge();
    if (logger) logger.info("> challenge Alpha: " + curve.Fr.toString(challengeAlpha));

    return challengeAlpha;
}

/**
 * Compute challenge y, which is be used to compute Wp
 * It contains the previous challenge (alpha) and the commitment of W
 */
module.exports.computeChallengeY = function computeChallengeY(W, challengeAlpha, curve, logger) {
    // Initialize new transcript
    const transcript = new Keccak256Transcript(curve);

    // Add previous challenge alpha to the transcript
    transcript.addScalar(challengeAlpha);

    // Add commit W to the transcript
    transcript.addPolCommitment(W);

    // Calculate the challenge
    const challengeY = transcript.getChallenge();
    if (logger) logger.info("> challenge Y: " + curve.Fr.toString(challengeY));

    return challengeY;
}


/**
 * 
 */
function calculateRootsFi(initialOmega, initialValue, degFi, lcm, xiSeed, curve, logger) {
    const wPower = [];
    wPower[0] = curve.Fr.one;
    for (let i = 1; i < degFi; i++) {
        wPower[i] = curve.Fr.mul(wPower[i - 1], initialOmega);
    }

    const S = [];
    S[0] = initialValue;

    if (lcm % degFi !== 0) throw new Error(`Degree of the fi ${degFi} must divide ${lcm}`);

    for(let i = 0; i < lcm/degFi; ++i) {
        S[0] = curve.Fr.mul(S[0], xiSeed);
    }

    
    for (let i = 1; i < degFi; i++) {
        S[i] = curve.Fr.mul(S[0], wPower[i]);
    }

    return S;
}

/**
 * 
 */
module.exports.calculateRoots = function calculateRoots(zkey, xiSeed, curve, logger) {

    const roots = [];
    for(let i = 0; i < zkey.f.length; ++i) {
        const rootsFi = [];
        const nPols = zkey.f[i].pols.length;
        const initialOmega = zkey[`w${nPols}`];
        for(let k = 0; k < zkey.f[i].openingPoints.length; ++k) {
            const initValue = zkey.f[i].openingPoints[k] === 0 ? curve.Fr.one : zkey[`w${nPols}_${zkey.f[i].openingPoints[k]}d${nPols}`];
            const rootWi = calculateRootsFi(initialOmega, initValue, nPols, zkey.powerW, xiSeed, curve, logger);
            rootsFi.push(rootWi);    
        }
        roots.push(rootsFi);
    }

    return roots;
}


/**
 * 
 */
module.exports.getOrderedEvals = function getOrderedEvals(f, evaluations) {
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

/**
 *  Return the sum of all commits in G1 curve
 */
module.exports.sumCommits = function sumCommits(commits, curve, logger) {
    // Initialize commit to zero in G1 curve
    let commit = curve.G1.zeroAffine;

    // Add all the commits
    for(let i = 0; i < commits.length; ++i) {
        commit = curve.G1.add(commit, commits[i]); 
    }
    
    return curve.G1.toAffine(commit);
}  

/**
 *  Return the polynomial resulting of the addition of all provided polynomials
 */
module.exports.sumPolynomials = function sumPolynomials(polynomials, curve, logger) {
    // If only one polynomial is provided, return it
    if(polynomials.length === 1) return polynomials[0];

    // Calculate the maximum degree of the resulting polynomial
    let maxDegree = Math.max(...polynomials.map(p => p === undefined ? 0 : p.degree()));

    // Calculate the length of the buffer
    const lengthBuffer = 2 ** (log2(maxDegree) + 1);

    const sFr = curve.Fr.n8;

    // Initialize the resulting polynomial
    let polynomial = new Polynomial(new BigBuffer(lengthBuffer * sFr), curve, logger);

    // Add the coefficients of the polynomial
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

/**
 * 
 */
exports.addCommitsF = function addCommitsF(f, committedPols, addPols, curve, logger) {
    for(let i = 0; i < f.length; ++i) {
        const commits = [];
        const pols = [];
        for(let j = 0; j < f[i].stages.length; ++j) {
            const index = `f${f[i].index}_${f[i].stages[j].stage}`;
            if(!committedPols[`${index}`]) throw new Error(`${index} not found`); 
            if(!committedPols[`${index}`].commit) throw new Error(`${index} commit is missing`);
            if(addPols) {
                if(!committedPols[`${index}`].pol) throw new Error(`${index} polynomial is missing`);
                pols.push(committedPols[`${index}`].pol);
            }
            commits.push(committedPols[`${index}`].commit);
        }
        f[i].commit = module.exports.sumCommits(commits, curve, logger);
        if(addPols) {
            f[i].pol = module.exports.sumPolynomials(pols, curve, logger); 
            if(f[i].pol.degree() > f[i].degree) throw new Error(`f${i} degree (${f[i].pol.degree()}) does not match with the configuration (${f[i].degree})`)
        }
    }
}
