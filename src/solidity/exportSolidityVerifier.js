const ejs = require("ejs");
const {utils} = require("ffjavascript");
const { getOrderedEvals } = require("../helpers/helpers.js");
const path = require("path");
const fs = require("fs");
const { lcm } = require("../utils.js");

module.exports.exportSolidityVerifier = async function exportSolidityVerifier(vk, curve, options = {}) {
    const logger = options.logger;
    const extendLoops = options.extendLoops || false;

    const nonCommittedPols = options.nonCommittedPols ? options.nonCommittedPols : [];

    const xiSeed = options.xiSeed ? true : false;


    // Sort f by index
    vk.f.sort((a, b) => a.index - b.index);

    if (logger) logger.info("FFLONK EXPORT SOLIDITY VERIFIER STARTED");

    //Precompute omegas
    const omegas = Object.keys(vk).filter(k => k.match(/^w\d+/));
    const ws = {};
    for(let i = 0; i < omegas.length; ++i) {
        if(omegas[i].includes("_")) {
            ws[omegas[i]] = vk[omegas[i]];
            continue;
        }
        let acc = curve.Fr.one;
        let pow = Number(omegas[i].slice(1));
        for(let j = 1; j < Number(omegas[i].slice(1)); ++j) {
            acc = curve.Fr.mul(acc, curve.Fr.e(vk[omegas[i]]));
            ws[`w${pow}_${j}`] = toVkey(acc);
        }
    }

    const powerW = lcm(Object.keys(vk).filter(k => k.match(/^w\d+$/)).map(wi => wi.slice(1)));

    vk.powerW = powerW;

    let orderedEvals = getOrderedEvals(vk.f);

    orderedEvals = orderedEvals.filter(e => !nonCommittedPols.includes(e.name));

    orderedEvals.push({name: "inv"});

    orderedEvals = orderedEvals.map(e => e.name);

    const obj = {
        vk,
        orderedEvals,
        ws,
        xiSeed,
        nonCommittedPols,
        extendLoops,
    };
    if (logger) logger.info("FFLONK EXPORT SOLIDITY VERIFIER FINISHED");

    const template = await fs.promises.readFile(path.resolve(__dirname, "verifier.sol.ejs"), "utf-8");

    return ejs.render(template, obj); 

    function toVkey(val) {
        const str = curve.Fr.toObject(val);
        return utils.stringifyBigInts(str);
    }
}

