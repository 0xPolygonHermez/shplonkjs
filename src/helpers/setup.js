const { Scalar, BigBuffer, getCurveFromQ } = require("ffjavascript");
const { readBinFile } = require("@iden3/binfileutils");
const { getDivisors, calculateSplits, calculateSumCombinations } = require("../utils.js");

function calculateDegree(polsLength, pols) {
    let count = 0;
    let maxDegree;
    for(let k = 0; k < polsLength.length; ++k) {
        const p = pols.slice(count, count + polsLength[k]);
        const degrees = p.map((pi, index) => pi.degree*polsLength[k] + index);
        const fiDegree = Math.max(...degrees);
        if(!maxDegree || fiDegree > maxDegree) maxDegree = fiDegree;
        count += polsLength[k];
    }
    return maxDegree;
}


function calculatePolsLength(pols, n, divisors) {
    const N = pols.length;
        
    let possibleSplits = [];
    calculateSplits([], 0, N, n, 0, divisors, possibleSplits);
    let maxDegree;
    let split;
    for(let i = 0; i < possibleSplits.length; ++i) {
        const deg = calculateDegree(possibleSplits[i], pols);
        if(!maxDegree || deg < maxDegree) {
            maxDegree = deg;
            split = possibleSplits[i];
        }
    }    

    const splitPol = [];
    let count = 0;
    if(split) {
        for(let i = 0; i < split.length; ++i) {
            const p = pols.slice(count, count + split[i]);
            splitPol.push(p);
            count += split[i];
        }
    }
   
    return splitPol;
}

function calculateMultiplePolsLength(pols, n) {
    const order = 21888242871839275222246405745257275088548364400416034343698204186575808495616n;
    const divisors = pols.map(p => getDivisors(order, p.length));
    const possibleSplits = {};
    for(let j = 0; j <= n - pols.length; ++j) {
        for(let i = 0; i < pols.length; ++i) {
            const split = calculatePolsLength(pols[i], j + 1, divisors[i]);
            if(split.length > 0) {
                if(!possibleSplits[i]) possibleSplits[i] = {};
                possibleSplits[i][j] = split;
            }
        }
    }   

    const lengths = [];
    for(let j = 0; j < pols.length; ++j) {
        if(!possibleSplits[j]) throw new Error("Invalid configuration. Some of the composed polynomials do not have any valid split");
        lengths.push(Object.keys(possibleSplits[j]).map(k => Number(k)));
    }

    let possibleCombinations = [];
    calculateSumCombinations([], lengths, 0, n - pols.length, 0, possibleCombinations)

    let maxDegree;
    let splitPol;
    for(let i = 0; i < possibleCombinations.length; ++i) {
        const split = possibleCombinations[i].map((c, index) => calculatePolsLength(pols[index], c + 1, divisors[index]));
        const degs = split.map((s, index) => calculateDegree(s.map(si => si.length), pols[index]));
        const finalDeg = Math.max(...degs);
        if(!maxDegree || finalDeg < maxDegree) {
            maxDegree = finalDeg;
            splitPol = [];
            for(let j = 0; j < split.length; ++j) {
                splitPol = [...splitPol, ...split[j]];
            }
        }
    }

    return splitPol;
}

exports.getFByStage = function getFByStage(config) {
    const stages = [...new Set(config.polDefs.flat().map(p => p.stage))];
    const polsStages = [];
    for(let i = 0; i < stages.length; ++i) {
        let openingPoints = [];
        let polsStage = [];
        for(let j = 0; j < config.polDefs.length; ++j) {
            const polynomials = config.polDefs[j].filter(p => p.stage === stages[i]);
            const names = polynomials.map(p => p.name);
            if((new Set(names)).size !== names.length) throw new Error(`Some polynomials are duplicated in the same stage`);
            polsStage.push(...polynomials);

            if(polynomials.length > 0) {
                openingPoints.push(j);
            }
        }

        let checkPols = {};

        let pols = [];
        for(let k = 0; k < polsStage.length; ++k) {
            if(!pols.map(p => p.name).includes(polsStage[k].name)){
                pols.push(polsStage[k]);
            }
            if(!checkPols[polsStage[k].name]) checkPols[polsStage[k].name] = 0;
            ++checkPols[polsStage[k].name];
        }

        if(!Object.values(checkPols).every(count => count === Object.values(checkPols)[0]) 
            || pols.length * openingPoints.length !== polsStage.length) {
                throw new Error("Invalid configuration");
            }  

        pols = pols.sort((a,b) => a.degree <= b.degree ? 1 : -1);
        
        for(let j = 0; j < pols.length; ++j) {
            pols[j].openingPoints = openingPoints;
        }

        polsStages.push(pols);
    }
    return polsStages;
}

exports.getFByOpeningPoints = function getFByOpeningPoints(config) {
    const nOpeningPoints = config.polDefs.length;
    const polsOpeningPoints = [];
    for(let i = 0; i < nOpeningPoints; ++i) {  
        let pols = config.polDefs[i];      

        if((new Set(pols.map(p => p.name))).size !== pols.map(p => p.name).length) throw new Error(`Some polynomials are duplicated in the opening point`);
        pols = pols.sort((a,b) => a.degree <= b.degree ? 1 : -1);

        for(let j = 0; j < pols.length; ++j) {
            pols[j].openingPoints = [i];
        }
        
        polsOpeningPoints.push(pols);
    }
    return polsOpeningPoints;
}

exports.getFCustom = function getFCustom(config) {
    const polsDefs = config.polDefs;

    const fiIndexes = [...new Set(config.polDefs.flat().map(p => p.fi))];
    for(let i = 0; i < Math.max(...fiIndexes); ++i) {
        if(!fiIndexes.includes(i)) throw new Error(`fi index ${i} is missing`);
    }

    const polsCustom = [];
    for(let i = 0; i < polsDefs.length; ++i) {
        for(let j = 0; j < polsDefs[i].length; ++j) {
            if(!polsDefs[i][j].hasOwnProperty("fi")) throw new Error(`fi index not provided for ${polsDefs[i][j].name}`);
            const index = polsDefs[i][j].fi;
            if(!polsCustom[index]) polsCustom[index] = [];
            const polIndex = polsCustom[index].findIndex(p => p.name === polsDefs[i][j].name);
            if(polIndex !== -1) {
                if(polsCustom[index][polIndex].openingPoints.includes(i)) throw new Error(`${polsDefs[i][j].name} is duplicated in the ${i}th opening point`);
                polsCustom[index][polIndex].openingPoints.push(i);
            } else {
                polsDefs[i][j].openingPoints = [i];
                polsCustom[index] = [polsDefs[i][j], ...polsCustom[index]];
            }
        }
    }

    // Check that, when opening by stage, all polynomials are defined in all stages
    for(let i = 0; i < polsCustom.length; ++i) {
        const openingPoints = polsCustom[i][0].openingPoints.sort();
        for(let j = 1; j < polsCustom[i].length; ++j) {
            const openingPoints2 = polsCustom[i][j].openingPoints.sort();
            if(JSON.stringify(openingPoints) !== JSON.stringify(openingPoints2)) {
                const diffOpen1 = openingPoints.filter(element => !openingPoints2.includes(element));
                const diffOpen2 = openingPoints2.filter(element => !openingPoints.includes(element));
                
                if(diffOpen1.length > 0) {
                    throw new Error(`Polynomial ${polsCustom[i][0].name} is not opening in the following stages: ${diffOpen1}`);
                }

                if(diffOpen2.length > 0) {
                    throw new Error(`Polynomial ${polsCustom[i][j].name} is not defined in the following stages: ${diffOpen2}`);
                }
            }
        }

    }

    return polsCustom;
}

exports.applyExtraScalarMuls = function applyExtraScalarMuls(extraMuls, pols) {
    let f = [];
    let index = 0;
    
    let splittedPols = [];
    if(Array.isArray(extraMuls)) {
        for(let k = 0; k < pols.length; ++k) {
            const nPols = 1 + extraMuls[k];
            if(nPols > pols[k].length) throw new Error(`There are ${pols[k].length} polynomials defined in ${i}th polinomial but you are trying to split them in ${nPols}, which is not allowed`);
        
            const order = 21888242871839275222246405745257275088548364400416034343698204186575808495616n;
            const divisors = getDivisors(order, pols[k].length);

            const splitPols = calculatePolsLength(pols[k], nPols, divisors);
            if(splitPols.length === 0) throw new Error(`It does not exist any way to split ${pols[k].length} in ${nPols} different pols`);

            splittedPols.push(...splitPols);
        } 
    } else {
        const totalPols = extraMuls + pols.length; 
        if(totalPols > pols.flat(Infinity).length) throw new Error(`There are ${pols.flat(Infinity).length} pols but ${totalPols} extra muls were asked`);
        splittedPols = calculateMultiplePolsLength(pols, totalPols);
    }
    
    // Define the composed polinomial f with all the polinomials provided
    for(let k = 0; k < splittedPols.length; ++k) {
        const p = splittedPols[k];

        const degrees = p.map((pi, index) => pi.degree*splittedPols[k].length + index);
        const fiDegree = Math.max(...degrees);
        const polsNames = p.map(pi => pi.name);
        const polsNamesStage = p.map(pi => { return {name: pi.name, degree: pi.degree}; });
        const fi = {index: index++, pols: polsNames, openingPoints: p[0].openingPoints, degree: fiDegree, stages: [{stage: p[0].stage, pols: polsNamesStage}]};
    
        f.push(fi);
    }   
    
    return f;
}
   

async function readPTauHeader(fd, sections) {
    if (!sections[1])  throw new Error(fd.fileName + ": File has no  header");
    if (sections[1].length>1) throw new Error(fd.fileName +": File has more than one header");

    fd.pos = sections[1][0].p;
    const n8 = await fd.readULE32();
    const buff = await fd.read(n8);
    const q = Scalar.fromRprLE(buff);

    const curve = await getCurveFromQ(q);

    if (curve.F1.n64*8 != n8) throw new Error(fd.fileName +": Invalid size");

    const power = await fd.readULE32();
    const ceremonyPower = await fd.readULE32();

    if (fd.pos-sections[1][0].p != sections[1][0].size) throw new Error("Invalid PTau header size");

    return {curve, power, ceremonyPower};
}

exports.getPowersW = function getPowersW(f) {
    // Get all the different generators needed in the protocol 
    const wPowers = {};
    for(let i = 0; i < f.length; ++i) {
        let fi = f[i];
        for(let i = 0; i < fi.openingPoints.length; ++i) {
            if(!wPowers[fi.pols.length]) {
                wPowers[fi.pols.length] = [fi.openingPoints[i]];
            } else {
                if(!wPowers[fi.pols.length].includes(fi.openingPoints[i])) {
                    wPowers[fi.pols.length].push(fi.openingPoints[i]);
                }
            }
        }
    }

    return wPowers;
}
exports.getPowersOfTau = async function getPowersOfTau(f, ptauFilename, power, logger) {
        
    if(!ptauFilename) throw new Error(`Powers of Tau filename is not provided.`);
    
    const {fd: fdPTau, sections: pTauSections} = await readBinFile(ptauFilename, "ptau", 1, 1 << 22, 1 << 24);

    if (!pTauSections[12]) {
        throw new Error("Powers of Tau is not well prepared. Section 12 missing.");
    }

    // Get curve defined in PTau
    if (logger) logger.info("> Getting curve from PTau settings");
    const {curve} = await readPTauHeader(fdPTau, pTauSections);

    const sG1 = curve.G1.F.n8 * 2;
    const sG2 = curve.G2.F.n8 * 2;
    
    const maxFiDegree = Math.max(...f.map(fi => fi.degree)) + 1;

    const nDomainSize = Math.ceil(maxFiDegree / Math.pow(2, power));
    const pow2DomainSize = Math.pow(2, Math.ceil(Math.log2(nDomainSize)));

    if (pTauSections[2][0].size < maxFiDegree * sG1) {
        throw new Error("Powers of Tau is not big enough for this circuit size. Section 2 too small.");
    }
    if (pTauSections[3][0].size < sG2) {
        throw new Error("Powers of Tau is not well prepared. Section 3 too small.");
    }

    const len = maxFiDegree * sG1;
    const PTau = new BigBuffer(len);
    await fdPTau.readToBuffer(PTau, 0, len, pTauSections[2][0].p);
    
    const X_2 = await fdPTau.read(sG2, pTauSections[3][0].p + sG2);

    await fdPTau.close();

    return {PTau, X_2, curve};
}

exports.computeWi = function computeWi(k, curve, logger) {

    let orderRsub1 = Scalar.sub(curve.Fr.p, 1)

    if(Scalar.mod(orderRsub1, Scalar.e(k))) throw new Error(`${k} does not divide the order of the curve and hence cannot find a valid generator`);

    return curve.Fr.exp(curve.Fr.nqr, Scalar.div(orderRsub1, k));
}

exports.computeRootWi = function computeRootWi(k, kthRoot, power, curve, logger) {
    let orderRsub1 = Scalar.sub(curve.Fr.p, 1);

    if(Scalar.mod(orderRsub1, Scalar.e(k))) throw new Error(`${k} does not divide the order of the curve and hence cannot find a valid generator`);
    
    let value = curve.Fr.exp(curve.Fr.nqr, Scalar.div(orderRsub1, Scalar.mul(2**power,k)));

    let root = curve.Fr.one;
    for(let i = 0; i < kthRoot; ++i) {
        root = curve.Fr.mul(root, value);
    }
    return root;
}
