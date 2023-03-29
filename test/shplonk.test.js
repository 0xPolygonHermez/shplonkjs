const {BigBuffer, F1Field} = require("ffjavascript");
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

    async function shPlonkTest(config, ptauFilename, options = {}) {
        const tmpName = options.tmpName ? options.tmpName : "test";

        const xiSeed = options.xiSeed;
        const nonCommittedPols = options.nonCommittedPols ? options.nonCommittedPols : [];

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
        
        const [commits, evaluations] = await open(zkey, PTau, ctx, committedPols, curve, options);

        const isValid = await verifyOpenings(zkey, commits, evaluations, curve, options);
        assert(isValid);

        if (!fs.existsSync(`./tmp/calldata`)){
            fs.mkdirSync(`./tmp/calldata`, {recursive: true});
        }

        if (!fs.existsSync(`./tmp/contracts`)){
            fs.mkdirSync(`./tmp/contracts`, {recursive: true});
        }

        const inputs = await exportCalldata(`tmp/calldata/shplonk_calldata_${tmpName}.txt`, zkey, commits, evaluations, curve, options);
        await exportSolidityVerifier(`tmp/contracts/shplonk_verifier_${tmpName}.sol`, zkey, commits, curve, options);

        await run("compile");

        const ShPlonkVerifier = await ethers.getContractFactory(`tmp/contracts/shplonk_verifier_${tmpName}.sol:ShPlonkVerifier`);
        const shPlonkVerifier = await ShPlonkVerifier.deploy();

        await shPlonkVerifier.deployed();

        if(xiSeed || nonCommittedPols.length > 0) {
            expect(await shPlonkVerifier.verifyProof(...inputs)).to.equal(true);
        } else {
            expect(await shPlonkVerifier.verifyProof(inputs)).to.equal(true);
        }

        
    }

    it.skip("Testing shplonk with pil-fflonk pols", async () => {
        const config = {
            "power":5,
            "polDefs":[
                [
                    {"name":"GlobalL1","stage":0,"degree":32},
                    {"name":"FinalS0","stage":0,"degree":32},
                    {"name":"FinalS1","stage":0,"degree":32},
                    {"name":"FinalS2","stage":0,"degree":32},
                    {"name":"FinalS3","stage":0,"degree":32},
                    {"name":"FinalS4","stage":0,"degree":32},
                    {"name":"FinalS5","stage":0,"degree":32},
                    {"name":"FinalC0","stage":0,"degree":32},
                    {"name":"FinalC1","stage":0,"degree":32},
                    {"name":"FinalC2","stage":0,"degree":32},
                    {"name":"FinalC3","stage":0,"degree":32},
                    {"name":"FinalC4","stage":0,"degree":32},
                    {"name":"FinalPARTIAL","stage":0,"degree":32},
                    {"name":"FinalPOSEIDON_T","stage":0,"degree":32},
                    {"name":"FinalRANGE_CHECK","stage":0,"degree":32},
                    {"name":"FinalGATE","stage":0,"degree":32},
                    {"name":"Finala0","stage":1,"degree":32},
                    {"name":"Finala1","stage":1,"degree":32},
                    {"name":"Finala2","stage":1,"degree":32},
                    {"name":"Finala3","stage":1,"degree":32},
                    {"name":"Finala4","stage":1,"degree":32},
                    {"name":"Finala5","stage":1,"degree":32},
                    {"name":"ConnectionZ0","stage":3,"degree":32},
                    {"name":"ImP0","stage":4,"degree":32},
                    {"name":"ImP1","stage":4,"degree":32},
                    {"name":"ImP2","stage":4,"degree":32},
                    {"name":"ImP3","stage":4,"degree":32},
                    {"name":"ImP4","stage":4,"degree":32},
                    {"name":"ImP5","stage":4,"degree":32},
                    {"name":"ImP6","stage":4,"degree":32},
                    {"name":"PolIden0","stage":5,"degree":32},
                    {"name":"PolIden1","stage":5,"degree":32},
                    {"name":"PolIden2","stage":5,"degree":32},
                    {"name":"PolIden3","stage":5,"degree":32},
                    {"name":"PolIden4","stage":5,"degree":32},
                    {"name":"PolIden5","stage":5,"degree":32},
                    {"name":"PolIden6","stage":5,"degree":32},
                    {"name":"PolIden7","stage":5,"degree":32},
                    {"name":"PolIden8","stage":5,"degree":32},
                    {"name":"PolIden9","stage":5,"degree":32},
                    {"name":"PolIden10","stage":5,"degree":32},
                    {"name":"PolIden11","stage":5,"degree":32},
                    {"name":"PolIden12","stage":5,"degree":32},
                    {"name":"PolIden13","stage":5,"degree":32},
                    {"name":"PolIden14","stage":5,"degree":32},
                    {"name":"PolIden15","stage":5,"degree":32}
                ],
                [
                    {"name":"Finala0","stage":1,"degree":32},
                    {"name":"Finala1","stage":1,"degree":32},
                    {"name":"Finala2","stage":1,"degree":32},
                    {"name":"Finala3","stage":1,"degree":32},
                    {"name":"Finala4","stage":1,"degree":32},
                    {"name":"ConnectionZ0","stage":3,"degree":32}
                ]
            ],
            "extraMuls":6,
            "openBy":"openingPoints"
        }

        const ptauFilename = path.join("test", "powersOfTau15_final.ptau");

        await shPlonkTest(config, ptauFilename, {tmpName: "pilfflonk", extendLoops: true});

    })

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
                "extraMuls": 2,
                "openBy": 'stage',
            };
    
            await shPlonkTest(config, ptauFilename, {tmpName: "fflonk", extendLoops: true});
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
                "extraMuls": 3,
                "openBy": 'stage',
            };
    
            await shPlonkTest(config, ptauFilename, {tmpName: "fflonk2", extendLoops: true});
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
    
            await shPlonkTest(config, ptauFilename, {tmpName: "test3", extendLoops: true});
        });

        it("shplonk full test with specifying some polynomials that are not part of the proof", async () => {
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
    
            await shPlonkTest(config, ptauFilename, {tmpName: "testNonCommitted", nonCommittedPols: ["T0", "T1", "T2"], extendLoops: true});
        });

        it("shplonk full test specifying xiSeed from outside the protocol", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const F = new F1Field(21888242871839275222246405745257275088548364400416034343698204186575808495617n);
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
    
            await shPlonkTest(config, ptauFilename, {xiSeed: F.random(), tmpName: "testXiSeed", extendLoops: true});
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

            await shPlonkTest(config, ptauFilename, {tmpName: "test4", extendLoops: true});
        });

        it("shplonk full test with scalar multiplications specified by opening points (fflonk)", async () => {
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
                "extraMuls": 3,
                "openBy": 'openingPoints',
            };
    
            await shPlonkTest(config, ptauFilename, {tmpName:"fflonk3", extendLoops: true});
        });


        it("shplonk full basic test with scalar multiplications specified by opening points (fflonk)", async () => {
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
                "extraMuls": 4,
                "openBy": 'openingPoints',
            };
    
            await shPlonkTest(config, ptauFilename, {tmpName: "fflonk4", extendLoops: true});
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
    
            await shPlonkTest(config, ptauFilename, {tmpName: "test6", extendLoops: true});
        });
    });

    
});
