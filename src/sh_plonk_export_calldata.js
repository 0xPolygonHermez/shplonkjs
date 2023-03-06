import { getOrderedEvals, sumCommits } from "./sh_plonk_helpers.js";
import fs from "fs";

function i2hex(i) {
    return ("0" + i.toString(16)).slice(-2);
}

export default async function exportCalldata(fileName, zkey, xiSeed, committedPols, evaluations, curve, logger) {

    const G1 = curve.G1;
    const Fr = curve.Fr;

    const f = zkey.f;

    for(let i = 0; i < f.length; ++i) {
        const commits = [];
        for(let j = 0; j < f[i].stages.length; ++j) {
            const index = `${f[i].index}_${f[i].stages[j].stage}`;
            if(!committedPols[`f${index}`]) throw new Error(`f${index} not found`); 
            if(!committedPols[`f${index}`].commit) throw new Error(`f${index} commit is missing`);
            commits.push(committedPols[`f${index}`].commit);
        }
        f[i].commit = sumCommits(commits, curve, logger);
    }

    const fCommitted = f.filter(fi => fi.stages.length !== 1 || fi.stages[0].stage !== 0).sort((a, b) => a.index >= b.index ? 1 : -1);

    const nG1 = 2 + fCommitted.length;
    const nFr = 1 + Object.keys(evaluations).length;

    const proofBuff = new Uint8Array(G1.F.n8 * 2 * nG1 + Fr.n8 * nFr);

    G1.toRprUncompressed(proofBuff, 0, G1.e(committedPols.W1.commit));
    G1.toRprUncompressed(proofBuff, G1.F.n8 * 2, G1.e(committedPols.W2.commit));

    
    for(let i = 0; i < fCommitted.length; ++i) {
        G1.toRprUncompressed(proofBuff, G1.F.n8 * 2 * (i + 2), G1.e(fCommitted[i].commit));
    }

    const orderedEvals = getOrderedEvals(f, evaluations);

    for(let i = 0; i < orderedEvals.length; ++i) {
        Fr.toRprBE(proofBuff, G1.F.n8 * 2 * nG1 + Fr.n8 * i, orderedEvals[i].evaluation);
    }

    Fr.toRprBE(proofBuff, G1.F.n8 * 2 * nG1 + Fr.n8 * orderedEvals.length, evaluations.inv);
    Fr.toRprBE(proofBuff, G1.F.n8 * 2 * nG1 + Fr.n8 * (orderedEvals.length + 1), xiSeed);


    const proofHex = `0x${Array.from(proofBuff).map(i2hex).join("")}`;
    
    fs.writeFileSync(fileName, proofHex, "utf-8");

    return;
}
