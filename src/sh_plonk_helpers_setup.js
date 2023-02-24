import { Scalar, BigBuffer } from "ffjavascript";
import { readBinFile } from "@iden3/binfileutils";
import * as utils from "./powersoftau_utils.js";

export function getF(config) {
    let f = [];
    if(config.stages !== config.extraMuls.length) throw new Error("");
    for(let i = 0; i < config.stages; ++i) {
        let openingPoints = [];
        let polsStage = [];
        for(let j = 0; j < config.polDefs.length; ++j) {
            const polynomials = config.polDefs[j].filter(p => p.stage === i);
            for(let k = 0; k < polynomials.length; ++k) {
                if(!polsStage.map(p => p.name).includes(polynomials[k].name)){
                    polsStage.push(polynomials[k]);
                }
            }
            if(polynomials.length > 0) {
                openingPoints.push(j);
            }
        }


        const nPolsStage = polsStage.length;

        polsStage = polsStage.sort((a,b) => a.degree <= b.degree ? 1 : -1);
        
        const nPols = 1 + config.extraMuls[i];

        if(nPols > nPolsStage) throw new Error("");

        let count = 0;

        // Define the composed polinomial f with all the polinomials provided
        for(let k = 0; k < nPols; ++k) {
            const length = (nPols - k) <= nPolsStage % nPols ? Math.ceil(nPolsStage / nPols) : Math.floor(nPolsStage / nPols);
            const p = polsStage.slice(count, count + length);
            count += length;

            const degrees = p.map((pi, index) => pi.degree*length + index);
            const fiDegree = Math.max(...degrees);
            const includedProof = i === 0 ? false : true;
            const fi = {index: f.length, pols: p.map(pi => pi.name), openingPoints, degree: fiDegree, includedProof};
        
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
    const {curve: curvePTau} = await utils.readPTauHeader(fdPTau, pTauSections);
    if(curve !== curvePTau) throw new Error("Invalid curve");

    const sG1 = curve.G1.F.n8 * 2;
    const sG2 = curve.G2.F.n8 * 2;
    
    
    // TODO: CHECK THIS IS PROBABLY WRONG!!! THE CORRECT APPROACH WILL BE maxFiDegree + ????
    const PTauDegree = (maxFiDegree + nPols);

    const nDomainSize = Math.ceil(PTauDegree / Math.pow(2, power));
    const pow2DomainSize = Math.pow(2, Math.ceil(Math.log2(nDomainSize)));
    const extendedDomainSize = Math.pow(2, power) * pow2DomainSize;

    if (pTauSections[2][0].size < PTauDegree * sG1) {
        throw new Error("Powers of Tau is not big enough for this circuit size. Section 2 too small.");
    }
    if (pTauSections[3][0].size < sG2) {
        throw new Error("Powers of Tau is not well prepared. Section 3 too small.");
    }

    const PTau = new BigBuffer(extendedDomainSize * sG1);
    await fdPTau.readToBuffer(PTau, 0, PTauDegree * sG1, pTauSections[2][0].p);
    
    const X_2 = await fdPTau.read(sG2, pTauSections[3][0].p + sG2);

    return {PTau, X_2};
}

export function computeRootWi(n, nthRoot, power, curve, logger) {
    // Hardcorded 3th-root of Fr.w[28]

    let x = curve.Fr.e(467799165886069610036046866799264026481344299079011762026774533774345988080n);

    let r = curve.Fr.one;
    for(let i = 0; i < n; ++i) {
        r = curve.Fr.mul(r, x);
    }
    
    let root = curve.Fr.one;
    for(let i = 0; i < nthRoot; ++i) {
        root = curve.Fr.mul(root, curve.Fr.e(467799165886069610036046866799264026481344299079011762026774533774345988080n));

    }
    return curve.Fr.exp(root, 2 ** (28 - power));
}

export function computeWi(n, curve, logger) {
    const Fr = curve.Fr;

    if (n && (n & (n - 1)) === 0) {
        return Fr.w[Math.log2(n)];
    }
    
    // WHYYYYYY ?
    let orderRsub1 = Scalar.div(Scalar.sub(Fr.p, 1), 6);
    
    let exponent = Scalar.div(orderRsub1, n);

    let value = Fr.two;
    let gen = Fr.exp(value, exponent);

    while(!isValidGenerator(n)) {
        value = Fr.add(value, Fr.one);
        gen = Fr.exp(value, exponent);
    }

    return gen;

    function isValidGenerator(n) {  
        let nthRoot = gen;
        for(let i = 0; i < n; ++i) {
            nthRoot = Fr.mul(nthRoot, gen);
        }

        if(Fr.eq(gen, nthRoot)) return true;
        return false;
    }  
}
