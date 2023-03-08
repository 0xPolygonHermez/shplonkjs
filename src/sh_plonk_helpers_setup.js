import { Scalar, BigBuffer } from "ffjavascript";
import { readBinFile } from "@iden3/binfileutils";
import * as ptau_utils from "./powersoftau_utils.js";
import { checkValidRoot } from "./helpers_generators.js";
import { getDivisors, f } from "./utils.js";

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
    if(possibleSplits.length === 0) throw new Error("");
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

export function getFByStage(config, curve) {
    let f = [];
    let index = 0;

    const nStages = Math.max(...config.polDefs.flat().map(p => p.stage)) + 1;
    if(nStages !== config.extraMuls.length) throw new Error("");
    for(let i = 0; i < nStages; ++i) {
        let openingPoints = [];
        let polsStage = [];
        for(let j = 0; j < config.polDefs.length; ++j) {
            const polynomials = config.polDefs[j].filter(p => p.stage === i);
            const names = polynomials.map(p => p.name);
            if((new Set(names)).size !== names.length) throw new Error("");
            polsStage.push(...polynomials);

            if(polynomials.length > 0) {
                openingPoints.push(j);
            }
        }

        if(polsStage.length % openingPoints.length !== 0) throw new Error("");
        
        let pols = [];
        for(let i = 0; i < polsStage.length; ++i) {
            if(!pols.map(p => p.name).includes(polsStage[i].name)){
                pols.push(polsStage[i]);
            }
        }

        pols = pols.sort((a,b) => a.degree <= b.degree ? 1 : -1);
        
        const nPols = 1 + config.extraMuls[i];
        if(nPols > pols.length) throw new Error("");
    
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
            const fi = {index: index++, pols: polsNames, openingPoints, degree: fiDegree, stages: [{stage: i, pols: polsNames}]};
        
            f.push(fi);
        }   
    }
    
    return f;
}

export function getFByOpeningPoints(config, curve) {
    let f = [];
    let index = 0;

    const nOpeningPoints = config.polDefs.length;
    if(nOpeningPoints !== config.extraMuls.length) throw new Error("");

    for(let i = 0; i < nOpeningPoints; ++i) {  
        let polynomials = config.polDefs[i];      

        if((new Set(polynomials.map(p => p.name))).size !== polynomials.map(p => p.name).length) throw new Error("");

        polynomials = polynomials.sort((a,b) => a.degree <= b.degree ? 1 : -1);

        const nPols = 1 + config.extraMuls[i];
        if(nPols > polynomials.length) throw new Error("");
    
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
                stages[p[l].stage].push(p[l].name);
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

export async function getPowersOfTau(f, ptauFilename, power, curve, logger) {
    let nPols = 0;
    let maxFiDegree = 0;
    for(let i = 0; i < f.length; ++i) {
        nPols += f[i].pols.length * f[i].openingPoints.length;
        if(f[i].degree > maxFiDegree) maxFiDegree = f[i].degree;
    }
        
    if(!ptauFilename) throw new Error("");
    
    const {fd: fdPTau, sections: pTauSections} = await readBinFile(ptauFilename, "ptau", 1, 1 << 22, 1 << 24);

    if (!pTauSections[12]) {
        throw new Error("Powers of Tau is not well prepared. Section 12 missing.");
    }

    // Get curve defined in PTau
    if (logger) logger.info("> Getting curve from PTau settings");
    const {curve: curvePTau} = await ptau_utils.readPTauHeader(fdPTau, pTauSections);
    if(curve !== curvePTau) throw new Error("Invalid curve");

    const sG1 = curve.G1.F.n8 * 2;
    const sG2 = curve.G2.F.n8 * 2;
    
    const nDomainSize = Math.ceil(maxFiDegree / Math.pow(2, power));
    const pow2DomainSize = Math.pow(2, Math.ceil(Math.log2(nDomainSize)));
    const extendedDomainSize = Math.pow(2, power) * pow2DomainSize;

    if (pTauSections[2][0].size < maxFiDegree * sG1) {
        throw new Error("Powers of Tau is not big enough for this circuit size. Section 2 too small.");
    }
    if (pTauSections[3][0].size < sG2) {
        throw new Error("Powers of Tau is not well prepared. Section 3 too small.");
    }

    const PTau = new BigBuffer(extendedDomainSize * sG1);
    await fdPTau.readToBuffer(PTau, 0, maxFiDegree * sG1, pTauSections[2][0].p);
    
    const X_2 = await fdPTau.read(sG2, pTauSections[3][0].p + sG2);

    await fdPTau.close();

    return {PTau, X_2};
}

export function computeWi(k, curve, logger) {

    let orderRsub1 = Scalar.sub(curve.Fr.p, 1)

    if(Scalar.mod(orderRsub1, Scalar.e(k))) throw new Error("");

    return curve.Fr.exp(curve.Fr.nqr, Scalar.div(orderRsub1, k));
}

export function computeRootWi(k, kthRoot, power, curve, logger) {
    let orderRsub1 = Scalar.sub(curve.Fr.p, 1);

    if(Scalar.mod(orderRsub1, Scalar.e(k))) throw new Error("");
    
    let value = curve.Fr.exp(curve.Fr.nqr, Scalar.div(orderRsub1, Scalar.mul(Scalar.pow(2,28),k)));

    let root = curve.Fr.one;
    for(let i = 0; i < kthRoot; ++i) {
        root = curve.Fr.mul(root, value);
    }
    return curve.Fr.exp(root, 2 ** (28 - power));
}
