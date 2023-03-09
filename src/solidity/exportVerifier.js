/*
    Copyright 2021 0KIMS association.

    This file is part of snarkJS.

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

const ejs = require("ejs");
const {utils} = require("ffjavascript");
const { getOrderedEvals } = require("../helpers/helpers.js");
const path = require("path");
const fs = require("fs");

module.exports.exportSolidityVerifier = async function exportSolidityVerifier(fileName, vk, curve, logger) {
    if (logger) logger.info("FFLONK EXPORT SOLIDITY VERIFIER STARTED");

    const f = vk.f;

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

    let fiDegrees = [...new Set(f.map(fi => fi.pols.length))];

    fiDegrees = fiDegrees.map(fi => {return {degree: fi, wPower: vk.powerW / fi}; }).sort((a, b) => a.wPower >= b.wPower ? 1 : -1);

    vk.X_2 = curve.G2.toObject(vk.X_2);

    const orderedEvals = getOrderedEvals(f);
    orderedEvals.push({name: "inv"});
    const obj = {
        vk,
        orderedEvals: orderedEvals.map(e => e.name),
        ws,
        f: f.sort((a, b) => a.index >= b.index ? 1 : -1), 
        fiDegrees: fiDegrees,
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

