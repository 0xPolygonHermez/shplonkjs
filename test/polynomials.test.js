const {BigBuffer, getCurveFromName} = require("ffjavascript");
const assert = require("assert");
const path = require("path");

const { readBinFile } = require('@iden3/binfileutils');

const { log2 } = require("../src/utils");
const { CPolynomial } = require("../src/polynomial/cpolynomial");
const { sumCommits, sumPolynomials } = require("../src/helpers/helpers");
const { Polynomial } = require("../src/polynomial/polynomial");

describe("Polynomials composition test suite", function () {
    this.timeout(1000000000);

    let curve;

    before(async () => {
        curve = await getCurveFromName("bn128");
    });

    after(async () => {
        await curve.terminate();
    });

    it("polynomials composition commits test", async () => {
        const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
        
        const pols = [
            {"name": "P1", "stage": 0, "degree": 32},
            {"name": "P2", "stage": 0, "degree": 33},
            {"name": "P3", "stage": 0, "degree": 64},
            {"name": "P4", "stage": 0, "degree": 65},
        ];

        if(!ptauFilename) throw new Error(`Powers of Tau filename is not provided.`);

        const {fd: fdPTau, sections: pTauSections} = await readBinFile(ptauFilename, "ptau", 1, 1 << 22, 1 << 24);

        if (!pTauSections[12]) {
            throw new Error("Powers of Tau is not well prepared. Section 12 missing.");
        }

        const sG1 = curve.G1.F.n8 * 2;

        const PTau = new BigBuffer(512 * sG1);
        await fdPTau.readToBuffer(PTau, 0, 264 * sG1, pTauSections[2][0].p);

        await fdPTau.close();

        const sFr = curve.Fr.n8;    

        const ctx = {};
        let c = 0;
        for(let i = 0; i < pols.length; ++i) {
            const lengthBuffer = 2 ** (log2(pols[i].degree) + 1);
            ctx[pols[i].name] = new Polynomial(new BigBuffer(lengthBuffer * sFr), curve);
            for(let j = 0; j < pols[i].degree; ++j) {
                ctx[pols[i].name].setCoef(j, curve.Fr.e(c++));
            }
        }

        const cPol = new CPolynomial(pols.length, curve);
        const cPols = [];
        const promises = [];
        for(let i = 0; i < pols.length; ++i) {
            cPol.addPolynomial(i, ctx[pols[i].name]);
            cPols[i] = new CPolynomial(pols.length, curve);
            cPols[i].addPolynomial(i, ctx[pols[i].name]);
            promises.push(cPols[i].getPolynomial().multiExponentiation(PTau));
        }

        const composedCommits = await Promise.all(promises);
        const commitsSum = sumCommits(composedCommits, curve);

        const commit = await cPol.getPolynomial().multiExponentiation(PTau);

        assert(curve.Fr.eq(commit, commitsSum));

        const composedPol = sumPolynomials(cPols.map(p => p.getPolynomial()), curve);

        assert(composedPol.length() === cPol.getPolynomial().length());
        for(let i = 0; i < composedPol.length; ++i) {
            assert(curve.Fr.eq(composedPol.getCoef(i), cPol.getPolynomial().getCoef(i)));
        }
    });
});
