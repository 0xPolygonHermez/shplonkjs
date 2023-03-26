const ejs = require("ejs");
const {utils} = require("ffjavascript");
const { getOrderedEvals } = require("../helpers/helpers.js");
const path = require("path");
const fs = require("fs");
const { lcm } = require("../utils.js");

module.exports.exportSolidityVerifier = async function exportSolidityVerifier(fileName, vk, commits, curve, options = {}) {
    const logger = options.logger;
    
    if (logger) logger.info("FFLONK EXPORT SOLIDITY VERIFIER STARTED");

    for(let i = 0; i < vk.f.length; ++i) {
        if(vk.f[i].stages.length === 1 && vk.f[i].stages[0].stage === 0) {
            if(!commits[`f${vk.f[i].index}`]) throw new Error(`f${vk.f[i].index} commit is missing`);
            vk[`f${vk.f[i].index}`] = curve.G1.toObject(commits[`f${vk.f[i].index}`]);
        }
    }

    // Sort f by index
    vk.f.sort((a, b) => a - b);

    //Precompute omegas
    const omegas = Object.keys(vk).filter(n => n.startsWith(("w")));
    const ws = {};
    for(let i = 0; i < omegas.length; ++i) {
        if(omegas[i].includes("_")) {
            ws[omegas[i]] = toVkey(vk[omegas[i]]);
            continue;
        }
        let acc = curve.Fr.one;
        let pow = Number(omegas[i].slice(1));
        for(let j = 1; j < Number(omegas[i].slice(1)); ++j) {
            acc = curve.Fr.mul(acc, vk[omegas[i]]);
            ws[`w${pow}_${j}`] = toVkey(acc);
        }
    }

    const degrees = [...new Set(vk.f.map(fi => fi.pols.length))];

    let fiWPowers = [];

    for(let i = 0; i < degrees.length; ++i) {
        let diffOpenings = vk.f.filter(fi => fi.pols.length === degrees[i]).map(fi => fi.openingPoints);
        diffOpenings = Array.from(new Set(diffOpenings.map(JSON.stringify)), JSON.parse);
        const openings = [...new Set(diffOpenings.flat())];
        const indexes = vk.f.filter(fi => fi.pols.length === degrees[i]).map(fi => fi.index);
        fiWPowers.push({degree: degrees[i], openingPoints: openings, index: indexes, diffOpenings})
    }
    
    for(let i = 0; i < fiWPowers.length; ++i) {
        let lagrangesRequired = [];
        for(let j = 0; j < fiWPowers[i].diffOpenings.length; ++j) {
            if(!lagrangesRequired.includes(fiWPowers[i].diffOpenings[j][0])) {
                lagrangesRequired.push(fiWPowers[i].diffOpenings[j][0]);
            }
        }
        fiWPowers[i].lagrangesRequired = lagrangesRequired;
    }

    const powerW = lcm(Object.keys(vk).filter(k => k.match(/^w\d$/)).map(wi => wi.slice(1)));

    fiWPowers = fiWPowers.map(fi => {return {degree: fi.degree, openingPoints: fi.openingPoints, wPower: powerW / fi.degree, index: fi.index, diffOpenings: fi.diffOpenings, lagrangesRequired: fi.lagrangesRequired}; }).sort((a, b) => a.wPower >= b.wPower ? 1 : -1);

    vk.powerW = powerW;
    vk.X_2 = curve.G2.toObject(vk.X_2);

    const orderedEvals = getOrderedEvals(vk.f);
    orderedEvals.push({name: "inv"});
    const obj = {
        vk,
        orderedEvals: orderedEvals.map(e => e.name),
        ws,
        fiWPowers,
        xiSeed: options.xiSeed,
    };
    if (logger) logger.info("FFLONK EXPORT SOLIDITY VERIFIER FINISHED");

    const template = await fs.promises.readFile(path.resolve(__dirname, "verifier.sol.ejs"), "utf-8");

    const verifierCode = ejs.render(template, obj); 
    fs.writeFileSync(fileName, verifierCode, "utf-8");

    function toVkey(val) {
        const str = curve.Fr.toObject(val);
        return utils.stringifyBigInts(str);
    }
}

