const {BigBuffer, getCurveFromName} = require("ffjavascript");
const path = require("path");
const {expect} = require("chai");
const {Polynomial} = require("../src/polynomial/polynomial.js");
const { commit, open, setup, verifyOpenings } = require("../src/shplonk.js");
const {exportCalldata} = require("../src/solidity/exportCalldata.js");
const {exportSolidityVerifier} = require("../src/solidity/exportSolidityVerifier.js");
const assert = require("assert");
const fs = require("fs");
const {log2} = require("../src/utils.js");
const {ethers, run} = require("hardhat");

describe("Shplonk test suite", function () {
    this.timeout(1000000000);

    async function shPlonkTest(config, ptauFilename, tmpName = "test") {
        const {zkey, PTau, curve} = await setup(config, ptauFilename);
    
        const sFr = curve.Fr.n8;    

        const pols = [];
        for(let i = 0; i < config.polDefs.length; ++i) {
            for(let j = 0; j < config.polDefs[i].length; ++j) {
                if(!pols.find(p => p.name === config.polDefs[i][j].name)) {
                    pols.push(config.polDefs[i][j]);
                }
            }
        }

        const ctx = {};
        let c = 100;
        for(let i = 0; i < pols.length; ++i) {
            const lengthBuffer = 2 ** (log2(pols[i].degree) + 1);
            ctx[pols[i].name] = new Polynomial(new BigBuffer(lengthBuffer * sFr), curve);
            for(let j = 0; j <= pols[i].degree; ++j) {
                ctx[pols[i].name].setCoef(j, curve.Fr.e(c++));
            }
        }

        const committedPols = {};

        const stages = [...new Set(config.polDefs.flat().map(p => p.stage))];
        for(let i = 0; i < stages.length; ++i) {
            const commitsStage = await commit(stages[i], zkey, ctx, PTau, true, curve);        
            for(let j = 0; j < commitsStage.length; ++j) {
                committedPols[`${commitsStage[j].index}`] = {commit: commitsStage[j].commit, pol: commitsStage[j].pol}
            }
        }
        
        const [commits, evaluations, xiSeed] = await open(zkey, PTau, ctx, committedPols, curve);

        const isValid = await verifyOpenings(zkey, commits, evaluations, curve);
        assert(isValid);

        if (!fs.existsSync(`./tmp/calldata`)){
            fs.mkdirSync(`./tmp/calldata`, {recursive: true});
        }

        if (!fs.existsSync(`./tmp/contracts`)){
            fs.mkdirSync(`./tmp/contracts`, {recursive: true});
        }

        const proof = await exportCalldata(`tmp/calldata/shplonk_calldata_${tmpName}.txt`, zkey, commits, evaluations, curve);
        
        await exportSolidityVerifier(`tmp/contracts/shplonk_verifier_${tmpName}.sol`, zkey, commits, curve);

        await run("compile");

        const ShPlonkVerifier = await ethers.getContractFactory(`tmp/contracts/shplonk_verifier_${tmpName}.sol:ShPlonkVerifier`);
        const shPlonkVerifier = await ShPlonkVerifier.deploy();

        await shPlonkVerifier.deployed();

        expect(await shPlonkVerifier.verifyProof(proof)).to.equal(true);
    }

    describe("Testing shplonk using setup by stage",() => {
        it("shplonk full test without scalar multiplications specified by stage (fflonk)", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const config = {
                "power": 5,
                "polDefs": [
                    [
                        {"name": "QL", "stage": 0, "degree": 31},
                        {"name": "QR", "stage": 0, "degree": 31},
                        {"name": "QO", "stage": 0, "degree": 31},
                        {"name": "QM", "stage": 0, "degree": 31},
                        {"name": "QC", "stage": 0, "degree": 31},
                        {"name": "Sigma1", "stage": 0, "degree": 31},
                        {"name": "Sigma2", "stage": 0, "degree": 31},
                        {"name": "Sigma3", "stage": 0, "degree": 31},
                        {"name": "A", "stage": 1, "degree": 31},
                        {"name": "B", "stage": 1, "degree": 31},
                        {"name": "C", "stage": 1, "degree": 31},
                        {"name": "T0", "stage": 1, "degree": 61},
                        {"name": "Z",  "stage": 2, "degree": 34},
                        {"name": "T1", "stage": 2, "degree": 33},
                        {"name": "T2", "stage": 2, "degree": 95}
                    ],
                    [
                        {"name": "Z",  "stage": 2, "degree": 34},
                        {"name": "T1", "stage": 2, "degree": 33},
                        {"name": "T2", "stage": 2, "degree": 95}
                    ],
                ], 
                "extraMuls": 0,
                "openBy": 'stage',
            };
    
            await shPlonkTest(config, ptauFilename, "fflonk");
        });

        it("shplonk full test with scalar multiplications specified by stage (fflonk)", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const config = {
                "power": 5,
                "polDefs": [
                    [
                        {"name": "QL", "stage": 0, "degree": 31},
                        {"name": "QR", "stage": 0, "degree": 31},
                        {"name": "QO", "stage": 0, "degree": 31},
                        {"name": "QM", "stage": 0, "degree": 31},
                        {"name": "QC", "stage": 0, "degree": 31},
                        {"name": "Sigma1", "stage": 0, "degree": 31},
                        {"name": "Sigma2", "stage": 0, "degree": 31},
                        {"name": "Sigma3", "stage": 0, "degree": 31},
                        {"name": "A", "stage": 1, "degree": 31},
                        {"name": "B", "stage": 1, "degree": 31},
                        {"name": "C", "stage": 1, "degree": 31},
                        {"name": "T0", "stage": 1, "degree": 61},
                        {"name": "Z",  "stage": 2, "degree": 34},
                        {"name": "T1", "stage": 2, "degree": 33},
                        {"name": "T2", "stage": 2, "degree": 95}
                    ],
                    [
                        {"name": "Z",  "stage": 2, "degree": 34},
                        {"name": "T1", "stage": 2, "degree": 33},
                        {"name": "T2", "stage": 2, "degree": 95}
                    ],
                ], 
                "extraMuls": 1,
                "openBy": 'stage',
            };
    
            await shPlonkTest(config, ptauFilename, "fflonk2");
        });

        it("shplonk full test with scalar multiplications specified by total number", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const config = {
                "power": 5,
                "polDefs": [
                    [
                        {"name": "QL", "stage": 0, "degree": 32},
                        {"name": "QR", "stage": 0, "degree": 32},
                        {"name": "QO", "stage": 0, "degree": 32},
                        {"name": "QM", "stage": 0, "degree": 32},
                        {"name": "QC", "stage": 0, "degree": 32},
                        {"name": "Sigma1", "stage": 0, "degree": 32},
                        {"name": "Sigma2", "stage": 0, "degree": 32},
                        {"name": "Sigma3", "stage": 0, "degree": 32},
                        {"name": "A", "stage": 1, "degree": 33},
                        {"name": "B", "stage": 1, "degree": 33},
                        {"name": "C", "stage": 1, "degree": 33},
                        {"name": "T0", "stage": 1, "degree": 65},
                        {"name": "Z",  "stage": 2, "degree": 34},
                        {"name": "T1", "stage": 2, "degree": 33},
                        {"name": "T2", "stage": 2, "degree": 101}
                    ],
                    [
                        {"name": "Z",  "stage": 2, "degree": 34},
                        {"name": "T1", "stage": 2, "degree": 33},
                        {"name": "T2", "stage": 2, "degree": 101}
                    ],
                    [
                        {"name": "T3", "stage": 3, "degree": 34},
                        {"name": "T4", "stage": 3,  "degree": 33},
                    ]
                ], 
                "extraMuls": 5,
                "openBy": 'stage',
            };
    
            await shPlonkTest(config, ptauFilename, "test3");
        });
    });

    describe("Testing shplonk using setup by opening points",() => {
        it("shplonk full basic test with no scalar multiplications", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const config = {
                "power": 5,
                "polDefs": [
                    [
                        {"name": "P0", "stage": 1, "degree": 32},
                        {"name": "P1", "stage": 1, "degree": 32},
                        {"name": "P2", "stage": 1, "degree": 33},
                        {"name": "P4", "stage": 2, "degree": 65},
                    ],
                    [
                        {"name": "P3", "stage": 1, "degree": 65},
                        {"name": "P5", "stage": 2, "degree": 33},
                        {"name": "P6", "stage": 2, "degree": 101}
                    ],
                    [
                        {"name": "Z",  "stage": 3, "degree": 34},
                        {"name": "T1", "stage": 3, "degree": 33},
                        {"name": "T2", "stage": 3, "degree": 101}
                    ], 
                ], 
                "extraMuls": [0, 0, 0],
                "openBy": 'openingPoints',
            };

            await shPlonkTest(config, ptauFilename, "test4");
        });

        it("shplonk full test with scalar multiplications specified by opening points (fflonk)", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const config = {
                "power": 5,
                "polDefs": [
                    [
                        {"name": "QL", "stage": 0, "degree": 32},
                        {"name": "QR", "stage": 0, "degree": 32},
                        {"name": "QO", "stage": 0, "degree": 32},
                        {"name": "QM", "stage": 0, "degree": 32},
                        {"name": "QC", "stage": 0, "degree": 32},
                        {"name": "Sigma1", "stage": 0, "degree": 32},
                        {"name": "Sigma2", "stage": 0, "degree": 32},
                        {"name": "Sigma3", "stage": 0, "degree": 32},
                        {"name": "A", "stage": 1, "degree": 33},
                        {"name": "B", "stage": 1, "degree": 33},
                        {"name": "C", "stage": 1, "degree": 33},
                        {"name": "T0", "stage": 1, "degree": 65},
                        {"name": "Z",  "stage": 2, "degree": 34},
                        {"name": "T1", "stage": 2, "degree": 33},
                        {"name": "T2", "stage": 2, "degree": 101}
                    ],
                    [
                        {"name": "Z",  "stage": 2, "degree": 34},
                        {"name": "T1", "stage": 2, "degree": 33},
                        {"name": "T2", "stage": 2, "degree": 101}
                    ],
                ], 
                "extraMuls": 7,
                "openBy": 'openingPoints',
            };
    
            await shPlonkTest(config, ptauFilename, "fflonk3");
        });


        it("shplonk full basic test with scalar multiplications specified by opening points", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const config = {
                "power": 5,
                "polDefs": [
                    [
                        {"name": "P1", "stage": 0, "degree": 32},
                        {"name": "P2", "stage": 0, "degree": 27},
                        {"name": "PZ", "stage": 0, "degree": 45},
                        {"name": "PT", "stage": 0, "degree": 33},
                        {"name": "P3", "stage": 1, "degree": 33},
                        {"name": "PL", "stage": 1, "degree": 33},
                        {"name": "PK", "stage": 2, "degree": 33},
                        {"name": "P4", "stage": 2, "degree": 34},
                    ],
                    [
                        {"name": "P4", "stage": 2, "degree": 34},
                        {"name": "P5", "stage": 2, "degree": 33},
                        {"name": "P6", "stage": 2, "degree": 101}
                    ],  
                    [
                        {"name": "P4", "stage": 2, "degree": 34},
                        {"name": "P5", "stage": 2, "degree": 33},
                        {"name": "P6", "stage": 2, "degree": 101}
                    ],  
                ], 
                "extraMuls": [5,1,2],
                "openBy": 'openingPoints',
            };
    
            await shPlonkTest(config, ptauFilename, "test5");
        });

        it("shplonk full basic test with scalar multiplications specified by total number", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const config = {
                "power": 5,
                "polDefs": [
                    [
                        {"name": "P1", "stage": 0, "degree": 32},
                        {"name": "P2", "stage": 0, "degree": 27},
                        {"name": "PZ", "stage": 0, "degree": 45},
                        {"name": "PT", "stage": 0, "degree": 33},
                        {"name": "P3", "stage": 1, "degree": 33},
                        {"name": "PL", "stage": 1, "degree": 33},
                        {"name": "PK", "stage": 2, "degree": 33},
                        {"name": "P4", "stage": 2, "degree": 34},
                    ],
                    [
                        {"name": "P4", "stage": 2, "degree": 34},
                        {"name": "P5", "stage": 2, "degree": 33},
                        {"name": "P6", "stage": 2, "degree": 101}
                    ],  
                    [
                        {"name": "P4", "stage": 2, "degree": 34},
                        {"name": "P5", "stage": 2, "degree": 33},
                        {"name": "P6", "stage": 2, "degree": 101}
                    ],  
                ], 
                "extraMuls": 8,
                "openBy": 'openingPoints',
            };
    
            await shPlonkTest(config, ptauFilename, "test6");
        });
    });

    
});
