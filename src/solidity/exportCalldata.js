const { getOrderedEvals } = require("../helpers/helpers.js");
const fs = require("fs");
const {ethers} = require("hardhat");

function i2hex(i) {
    return ("0" + i.toString(16)).slice(-2);
}

module.exports.exportCalldata = async function exportCalldata(fileName, vk, commits, evaluations, curve, options = {}) {

    const logger = options.logger; 

    // Sort f by index
    vk.f.sort((a, b) => a - b);

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

    const nG1 = 2 + fCommitted.length;
    const nFr = Object.keys(evaluations).length;

    // Define the proof buffer
    const proofBuff = new Uint8Array(G1.F.n8 * 2 * nG1 + Fr.n8 * nFr);

    // Add W and W' as the first two elements of the proof
    G1.toRprUncompressed(proofBuff, 0, G1.e(commits.W));
    G1.toRprUncompressed(proofBuff, G1.F.n8 * 2, G1.e(commits.Wp));

    // Add all the fi commits that goes into the proof buffer sorted by index
    for(let i = 0; i < fCommitted.length; ++i) {
        G1.toRprUncompressed(proofBuff, G1.F.n8 * 2 * (i + 2), G1.e(fCommitted[i].commit));
    }

    // Order the evaluations. It is important to keep this order to then be consistant with the solidity verifier
    const orderedEvals = getOrderedEvals(vk.f, evaluations);

    // Add all the evaluations into the proof buffer
    for(let i = 0; i < orderedEvals.length; ++i) {
        Fr.toRprBE(proofBuff, G1.F.n8 * 2 * nG1 + Fr.n8 * i, orderedEvals[i].evaluation);
    }

    // Add the montgomery batched inverse evaluation at the end of the buffer
    Fr.toRprBE(proofBuff, G1.F.n8 * 2 * nG1 + Fr.n8 * orderedEvals.length, evaluations.inv);

    const proofStringHex = Array.from(proofBuff).map(i2hex).join("");
    const proofHex = [];
    const proofSize = orderedEvals.length + 1 + (fCommitted.length * 2) + 4;
    for(let i = 0; i < proofSize; ++i) {
        proofHex.push(ethers.utils.hexZeroPad(`0x${proofStringHex.slice(i*64, (i+1)*64)}`, 32));
    }
    
    if(options.xiSeed) {
        fs.writeFileSync(fileName, JSON.stringify(`[${proofHex}, ${options.xiSeed}]`), "utf-8");
        return [proofHex, ethers.utils.hexlify(options.xiSeed)];
    } else {
        fs.writeFileSync(fileName, JSON.stringify(proofHex), "utf-8");
        return proofHex;
    }

}
