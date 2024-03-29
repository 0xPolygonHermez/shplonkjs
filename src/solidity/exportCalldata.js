const { getOrderedEvals } = require("../helpers/helpers.js");

function i2hex(i) {
    return ("0" + i.toString(16)).slice(-2);
}

module.exports.exportCalldata = async function exportCalldata(vk, commits, evaluations, curve, options = {}) {

    const logger = options.logger; 

    const nonCommittedPols = options.nonCommittedPols ? options.nonCommittedPols : [];
    
    // Sort f by index
    vk.f.sort((a, b) => a.index - b.index);

    const G1 = curve.G1;
    const Fr = curve.Fr;

    // Store the polynomial commits to its corresponding fi
    for(let i = 0; i < vk.f.length; ++i) {
        if(!commits[`f${vk.f[i].index}`]) throw new Error(`f${vk.f[i].index} commit is missing`);
        vk.f[i].commit = commits[`f${vk.f[i].index}`];
    }

    // Check which of the fi are committed into the proof and which ones are part of the setup. 
    // A committed polynomial fi will be considered part of the setup if all its polynomials composing it are from the stage 0
    const fCommitted = vk.f.filter(fi => fi.stages.length !== 1 || fi.stages[0].stage !== 0).sort((a, b) => a.index >= b.index ? 1 : -1);

    // Order the evaluations. It is important to keep this order to then be consistant with the solidity verifier
    const  orderedEvals = getOrderedEvals(vk.f, evaluations);

    const orderedEvalsCommitted = orderedEvals.filter(e => !nonCommittedPols.includes(e.name));

    const nG1 = 2 + fCommitted.length;
    const nFr = Object.keys(orderedEvalsCommitted).length + 1;

    // Define the non Committed evals buffer
    const nonCommittedEvalsBuff = new Uint8Array(Fr.n8 * nonCommittedPols.length);

    const orderedEvalsNonCommitted = orderedEvals.filter(e => nonCommittedPols.includes(e.name));

    // Define the proof buffer
    const proofBuff = new Uint8Array(G1.F.n8 * 2 * nG1 + Fr.n8 * nFr);

    // Add W and W' as the first two elements of the proof
    G1.toRprUncompressed(proofBuff, 0, G1.e(commits.W));
    G1.toRprUncompressed(proofBuff, G1.F.n8 * 2, G1.e(commits.Wp));

    // Add all the fi commits that goes into the proof buffer sorted by index
    for(let i = 0; i < fCommitted.length; ++i) {
        G1.toRprUncompressed(proofBuff, G1.F.n8 * 2 * (i + 2), G1.e(fCommitted[i].commit));
    }

    // Add committed evaluations into the proof buffer
    for(let i = 0; i < orderedEvalsCommitted.length; ++i) {
        Fr.toRprBE(proofBuff, G1.F.n8 * 2 * nG1 + Fr.n8 * i, orderedEvalsCommitted[i].evaluation);
    }

    // Add the montgomery batched inverse evaluation at the end of the buffer
    Fr.toRprBE(proofBuff, G1.F.n8 * 2 * nG1 + Fr.n8 * orderedEvalsCommitted.length, evaluations.inv);

    // Add non committed evaluations into the proof buffer
    for(let i = 0; i < nonCommittedPols.length; ++i) {
        Fr.toRprBE(nonCommittedEvalsBuff, Fr.n8 * i, orderedEvals.find(e => e.name === nonCommittedPols[i]).evaluation);
    }
    
    const proofStringHex = Array.from(proofBuff).map(i2hex).join("");
    const proofHex = [];
    const proofSize = orderedEvalsCommitted.length + 1 + (fCommitted.length * 2) + 4;
    for(let i = 0; i < proofSize; ++i) {
        proofHex.push(`0x${proofStringHex.slice(i*64, (i+1)*64).padStart(64, '0')}`);
    }
    let inputs = [proofHex];
    if(options.xiSeed) {
        inputs.push(`0x${options.xiSeed.toString(16).padStart(64, '0')}`);
    }

    if(nonCommittedPols.length > 0) {
        const nonCommittedEvalsStringHex = Array.from(nonCommittedEvalsBuff).map(i2hex).join("");
        const nonCommittedEvalsHex = [];
        for(let i = 0; i < orderedEvalsNonCommitted.length; ++i) {
            nonCommittedEvalsHex.push(`0x${nonCommittedEvalsStringHex.slice(i*64, (i+1)*64).padStart(64, '0')}`);
        }
        inputs.push(nonCommittedEvalsHex);
    }
    
    const inputString = JSON.stringify(inputs).substring(1, JSON.stringify(inputs).length - 1);

    return inputString;
}
