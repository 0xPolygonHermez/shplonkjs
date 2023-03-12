const { getOrderedEvals, addCommitsF } = require("../helpers/helpers.js");
const fs = require("fs");

function i2hex(i) {
    return ("0" + i.toString(16)).slice(-2);
}

module.exports.exportCalldata = async function exportCalldata(fileName, zkey, committedPols, evaluations, curve, logger) {

    // Sort f by index
    zkey.f.sort((a, b) => a - b);

    const G1 = curve.G1;
    const Fr = curve.Fr;

    // Store all the committed polynomials and its commits to its corresponding fi
    addCommitsF(zkey.f, committedPols, false, curve);

    // Check which of the fi are committed into the proof and which ones are part of the setup. 
    // A committed polynomial fi will be considered part of the setup if all its polynomials composing it are from the stage 0
    const fCommitted = zkey.f.filter(fi => fi.stages.length !== 1 || fi.stages[0].stage !== 0).sort((a, b) => a.index >= b.index ? 1 : -1);

    const nG1 = 2 + fCommitted.length;
    const nFr = Object.keys(evaluations).length;

    // Define the proof buffer
    const proofBuff = new Uint8Array(G1.F.n8 * 2 * nG1 + Fr.n8 * nFr);

    // Add W and W' as the first two elements of the proof
    G1.toRprUncompressed(proofBuff, 0, G1.e(committedPols.W.commit));
    G1.toRprUncompressed(proofBuff, G1.F.n8 * 2, G1.e(committedPols.Wp.commit));

    // Add all the fi commits that goes into the proof buffer sorted by index
    for(let i = 0; i < fCommitted.length; ++i) {
        G1.toRprUncompressed(proofBuff, G1.F.n8 * 2 * (i + 2), G1.e(fCommitted[i].commit));
    }

    // Order the evaluations. It is important to keep this order to then be consistant with the solidity verifier
    const orderedEvals = getOrderedEvals(zkey.f, evaluations);

    // Add all the evaluations into the proof buffer
    for(let i = 0; i < orderedEvals.length; ++i) {
        Fr.toRprBE(proofBuff, G1.F.n8 * 2 * nG1 + Fr.n8 * i, orderedEvals[i].evaluation);
    }

    // Add the montgomery batched inverse evaluation at the end of the buffer
    Fr.toRprBE(proofBuff, G1.F.n8 * 2 * nG1 + Fr.n8 * orderedEvals.length, evaluations.inv);

    // Convert the proof into hex
    const proofHex = `0x${Array.from(proofBuff).map(i2hex).join("")}`;
    
    fs.writeFileSync(fileName, proofHex, "utf-8");

    return;
}
