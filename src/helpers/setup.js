const { Scalar, BigBuffer, getCurveFromQ } = require("ffjavascript");
const { readBinFile } = require("@iden3/binfileutils");
const { getDivisors, f } = require("../utils.js");

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
    f([], 0, N, n, 0, divisors, possibleSplits);
    if(possibleSplits.length === 0) throw new Error(`It does not exist any way to split ${pols.length} in ${n} different pols`);
    let maxDegree;
    let split;
    for(let i = 0; i < possibleSplits.length; ++i) {
        const deg = calculateDegree(possibleSplits[i], pols);
        if(!maxDegree || deg < maxDegree) {
            maxDegree = deg;
            split = possibleSplits[i];
        }
    }    

    return split;
}

exports.getFByStage = function getFByStage(config, curve) {
    let f = [];
    let index = 0;

    const nStages = Math.max(...config.polDefs.flat().map(p => p.stage)) + 1;
    if(nStages !== config.extraMuls.length) throw new Error(`There are ${nStages} stages but ${config.extraMuls.length} extra muls were provided`);
    for(let i = 0; i < nStages; ++i) {
        let openingPoints = [];
        let polsStage = [];
        for(let j = 0; j < config.polDefs.length; ++j) {
            const polynomials = config.polDefs[j].filter(p => p.stage === i);
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

        if(!Object.values(checkPols).every(count => count === Object.values(checkPols)[0]))  throw new Error("Invalid configuration.");
        if(pols.length * openingPoints.length !== polsStage.length) throw new Error("Invalid configuration.");

        pols = pols.sort((a,b) => a.degree <= b.degree ? 1 : -1);
        
        const nPols = 1 + config.extraMuls[i];
        if(nPols > pols.length) throw new Error(`There are ${pols.length} polynomials defined in stage ${i} but you are trying to split them in ${nPols}, which is not allowed`);
    
        const order = Scalar.sub(curve.Fr.p, 1);
        const divisors = getDivisors(order, pols.length);
        
        const polsLength = calculatePolsLength(pols, nPols, divisors);

        // Define the composed polinomial f with all the polinomials provided
        let count = 0;
        for(let k = 0; k < polsLength.length; ++k) {
            const p = pols.slice(count, count + polsLength[k]);
            count += polsLength[k];

            const degrees = p.map((pi, index) => pi.degree*polsLength[k] + index);
            const fiDegree = Math.max(...degrees);
            const polsNames = p.map(pi => pi.name);
            const polsNamesStage = p.map(pi => { return {name: pi.name, degree: pi.degree}; });
            const fi = {index: index++, pols: polsNames, openingPoints, degree: fiDegree, stages: [{stage: i, pols: polsNamesStage}]};
        
            f.push(fi);
        }   
    }
    
    return f;
}

exports.getFByOpeningPoints = function getFByOpeningPoints(config, curve) {
    let f = [];
    let index = 0;

    const nOpeningPoints = config.polDefs.length;
    if(nOpeningPoints !== config.extraMuls.length) throw new Error(`There are ${nOpeningPoints} stages but ${config.extraMuls.length} extra muls were provided`);

    for(let i = 0; i < nOpeningPoints; ++i) {  
        let polynomials = config.polDefs[i];      

        if((new Set(polynomials.map(p => p.name))).size !== polynomials.map(p => p.name).length) throw new Error(`Some polynomials are duplicated in the opening point`);

        polynomials = polynomials.sort((a,b) => a.degree <= b.degree ? 1 : -1);

        const nPols = 1 + config.extraMuls[i];
        if(nPols > polynomials.length) throw new Error(`There are ${polynomials.length} polynomials defined in ${i}th opening point but you are trying to split them in ${nPols}, which is not allowed`);
    
        const order = Scalar.sub(curve.Fr.p, 1);
        const divisors = getDivisors(order, polynomials.length);
        
        const polsLength = calculatePolsLength(polynomials, nPols, divisors);

        // Define the composed polinomial f with all the polinomials provided
        let count = 0;
        for(let k = 0; k < polsLength.length; ++k) {
            const p = polynomials.slice(count, count + polsLength[k]);
            count += polsLength[k];

            const degrees = p.map((pi, index) => pi.degree*polsLength[k] + index);
            const fiDegree = Math.max(...degrees);
            const polsNames = p.map(pi => pi.name);
            const stages = {};
            for(let l = 0; l < p.length; ++l) {
                if(!stages[p[l].stage]) stages[p[l].stage] = [];
                stages[p[l].stage].push({name: p[l].name, degree: p[l].degree});
            }

            const stagesArray = [];
            for(let l = 0; l < Object.keys(stages).length; ++l){
                const stage = Number(Object.keys(stages)[l]);
                stagesArray.push({stage: stage, pols: stages[stage] })
            }
            const fi = {index: index++, pols: polsNames, openingPoints: [i], degree: fiDegree, stages: stagesArray};
            f.push(fi);
        }
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

exports.getPowersOfTau = async function getPowersOfTau(f, ptauFilename, power, curve, logger) {
        
    if(!ptauFilename) throw new Error(`Powers of Tau filename is not provided.`);
    
    const {fd: fdPTau, sections: pTauSections} = await readBinFile(ptauFilename, "ptau", 1, 1 << 22, 1 << 24);

    if (!pTauSections[12]) {
        throw new Error("Powers of Tau is not well prepared. Section 12 missing.");
    }

    // Get curve defined in PTau
    if (logger) logger.info("> Getting curve from PTau settings");
    const {curve: curvePTau} = await readPTauHeader(fdPTau, pTauSections);
    if(curve !== curvePTau) throw new Error("Invalid curve");

    const sG1 = curve.G1.F.n8 * 2;
    const sG2 = curve.G2.F.n8 * 2;
    
    const maxFiDegree = Math.max(...f.map(fi => fi.degree + 1));

    const nDomainSize = Math.ceil(maxFiDegree / Math.pow(2, power));
    const pow2DomainSize = Math.pow(2, Math.ceil(Math.log2(nDomainSize)));

    if (pTauSections[2][0].size < maxFiDegree * sG1) {
        throw new Error("Powers of Tau is not big enough for this circuit size. Section 2 too small.");
    }
    if (pTauSections[3][0].size < sG2) {
        throw new Error("Powers of Tau is not well prepared. Section 3 too small.");
    }

    const PTau = new BigBuffer(Math.pow(2, power) * pow2DomainSize * sG1);
    await fdPTau.readToBuffer(PTau, 0, maxFiDegree * sG1, pTauSections[2][0].p);
    
    const X_2 = await fdPTau.read(sG2, pTauSections[3][0].p + sG2);

    await fdPTau.close();

    return {PTau, X_2};
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
