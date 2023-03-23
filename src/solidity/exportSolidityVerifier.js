const ejs = require("ejs");
const {utils} = require("ffjavascript");
const { getOrderedEvals } = require("../helpers/helpers.js");
const path = require("path");
const fs = require("fs");
const { lcm } = require("../utils.js");

module.exports.exportSolidityVerifier = async function exportSolidityVerifier(fileName, vk, commits, curve, logger) {
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

    let fiWPowers = [...new Set(vk.f.map(fi => fi.pols.length))];

    const powerW = lcm(Object.keys(vk).filter(k => k.match(/^w\d$/)).map(wi => wi.slice(1)));

    fiWPowers = fiWPowers.map(fi => {return {degree: fi, wPower: powerW / fi}; }).sort((a, b) => a.wPower >= b.wPower ? 1 : -1);

    vk.powerW = powerW;
    vk.X_2 = curve.G2.toObject(vk.X_2);

    const orderedEvals = getOrderedEvals(vk.f);
    orderedEvals.push({name: "inv"});
    const obj = {
        vk,
        orderedEvals: orderedEvals.map(e => e.name),
        ws,
        fiWPowers,
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

