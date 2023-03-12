const {BigBuffer, getCurveFromName} = require("ffjavascript");
const path = require("path");
const Polynomial = require("../src/polynomial/polynomial.js");
const { commit, open, setup, verifyOpenings } = require("../src/index.js");
const {exportCalldata} = require("../src/solidity/exportCalldata.js");
const {exportSolidityVerifier} = require("../src/solidity/exportSolidityVerifier.js");
const assert = require("assert");
const fs = require("fs");
const {log2} = require("../src/utils.js");

describe("Shplonk test suite", function () {
    this.timeout(1000000000);

    let curve;

    before(async () => {
        curve = await getCurveFromName("bn128");
    });

    after(async () => {
        await curve.terminate();
    });

    async function shPlonkTest(config, ptauFilename, tmpName = "test") {
        const {zkey, PTau} = await setup(config, curve, ptauFilename);
    
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
    
            const nStages = Math.max(...config.polDefs.flat().map(p => p.stage)) + 1;

            for(let i = 0; i < nStages; ++i) {
                const commits = await commit(i, zkey, ctx, PTau, curve);        
                for(let j = 0; j < commits.length; ++j) {
                    committedPols[`f${commits[j].index}`] = {commit: commits[j].commit, pol: commits[j].pol}
                }
            }
            
            const [commitW, commitWp, evaluations, openingPoints, xiSeed] = await open(zkey, PTau, ctx, committedPols, curve);
    
            committedPols.W = { commit: commitW };
            committedPols.Wp = { commit: commitWp };
    
            const isValid = await verifyOpenings(zkey, committedPols, evaluations, curve);
            assert(isValid);
    
            if (!fs.existsSync(`./tmp/${tmpName}`)){
                fs.mkdirSync(`./tmp/${tmpName}`, { recursive: true });
            }

            await exportCalldata(`tmp/${tmpName}/shplonk_calldata.txt`, zkey, committedPols, evaluations, curve);
    
            await exportSolidityVerifier(`tmp/${tmpName}/shplonk_verifier.sol`, zkey, committedPols, curve);
    }

    describe("Testing shplonk using setup by stage",() => {
        it("shplonk full basic test with no scalar multiplications", async () => {
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
                        {"name": "T4", "stage": 3, "degree": 33},
                        {"name": "T3", "stage": 3, "degree": 101},
                        {"name": "T5", "stage": 3, "degree": 257},
                        {"name": "T6", "stage": 3, "degree": 256}
                    ]
                ], 
                "extraMuls": [0,0,0,0],
                "openBy": 'stage',
            };
    
            await shPlonkTest(config, ptauFilename, "test1");
        });
    
        it("shplonk full test with scalar multiplications", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const config = {
                "power": 7,
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
                "extraMuls": [4,2,1,0],
                "openBy": 'stage',
            };
    
            await shPlonkTest(config, ptauFilename, "test2");
        });
    });

    describe("Testing shplonk using setup by opening points",() => {
        it("shplonk full basic test with no scalar multiplications", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const config = {
                "power": 10,
                "polDefs": [
                    [
                        {"name": "P0", "stage": 0, "degree": 32},
                        {"name": "P1", "stage": 0, "degree": 32},
                        {"name": "P2", "stage": 1, "degree": 33},
                        {"name": "P4", "stage": 2, "degree": 65},
                    ],
                    [
                        {"name": "P4", "stage": 2, "degree": 65},
                        {"name": "P5", "stage": 2, "degree": 33},
                        {"name": "P6", "stage": 2, "degree": 101}
                    ],
                    [
                        {"name": "Z",  "stage": 2, "degree": 34},
                        {"name": "T1", "stage": 2, "degree": 33},
                        {"name": "T2", "stage": 2, "degree": 101}
                    ], 
                ], 
                "extraMuls": [0, 0, 0],
                "openBy": 'openingPoints',
            };

            await shPlonkTest(config, ptauFilename, "test3");
        });

        it("shplonk full basic test with scalar multiplications", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const config = {
                "power": 5,
                "polDefs": [
                    [
                        {"name": "P1", "stage": 0, "degree": 32},
                        {"name": "P2", "stage": 0, "degree": 32},
                        {"name": "P3", "stage": 1, "degree": 33},
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
                "extraMuls": [3,1,2],
                "openBy": 'openingPoints',
            };
    
            await shPlonkTest(config, ptauFilename, "test4");
        });
    });

    
});
