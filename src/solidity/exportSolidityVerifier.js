const ejs = require("ejs");
const {utils} = require("ffjavascript");
const { getOrderedEvals } = require("../helpers/helpers.js");
const path = require("path");
const fs = require("fs");

module.exports.exportSolidityVerifier = async function exportSolidityVerifier(vk, curve, options = {}) {
    const logger = options.logger;
    const extendLoops = options.extendLoops || false;

    const nonCommittedPols = options.nonCommittedPols ? options.nonCommittedPols : [];

    const xiSeed = options.xiSeed ? true : false;

    const createInterface = options.createInterface ? true : false;
    const checkInputs = options.checkInputs ? true : false;

    for(let i = 0; i < vk.f.length; ++i) {
        if(vk.f[i].stages.length === 1 && vk.f[i].stages[0].stage === 0) {
            vk.f[i].commit = curve.G1.toObject(vk.f[i].commit);
        }
    }

    // Sort f by index
    vk.f.sort((a, b) => a.index - b.index);

    if (logger) logger.info("FFLONK EXPORT SOLIDITY VERIFIER STARTED");

    //Precompute omegas
    const omegas = Object.keys(vk).filter(k => k.match(/^w\d+/));
    const ws = {};
    for(let i = 0; i < omegas.length; ++i) {
        if(omegas[i].includes("_")) {
            ws[omegas[i]] = toVkey(vk[omegas[i]]);
            continue;
        }
        let acc = curve.Fr.one;
        let pow = Number(omegas[i].slice(1));
        for(let j = 1; j < Number(omegas[i].slice(1)); ++j) {
            acc = curve.Fr.mul(acc, curve.Fr.e(vk[omegas[i]]));
            ws[`w${pow}_${j}`] = toVkey(acc);
        }
    }

    vk.X_2 = curve.G2.toObject(vk.X_2);

    let orderedEvals = getOrderedEvals(vk.f);

    orderedEvals = orderedEvals.filter(e => !nonCommittedPols.includes(e.name));

    orderedEvals.push({name: "inv"});

    orderedEvals = orderedEvals.map(e => e.name.replace(".", "_"));

    const obj = {
        vk,
        orderedEvals,
        ws,
        xiSeed,
        nonCommittedPols,
        extendLoops,
        checkInputs,
    };
    if (logger) logger.info("FFLONK EXPORT SOLIDITY VERIFIER FINISHED");

    const template = await fs.promises.readFile(path.resolve(__dirname, "verifier.sol.ejs"), "utf-8");

    if(!createInterface) {
        return ejs.render(template, obj);
    } else {
        const templateInterface = await fs.promises.readFile(path.resolve(__dirname, "interface_verifier.sol.ejs"), "utf-8");

        const verifierCode = ejs.render(template, obj);
        const interfaceVerifierCode = ejs.render(templateInterface, obj);
        return [ verifierCode, interfaceVerifierCode ]; 
    }

    function toVkey(val) {
        const str = curve.Fr.toObject(val);
        return utils.stringifyBigInts(str);
    }
}

