import {BigBuffer, getCurveFromName} from 'ffjavascript';
import path from "path";
import { commit, open, setup, verifyOpenings } from "../src/index.js";
import { Keccak256Transcript } from '../src/Keccak256Transcript.js';
import { log2 } from '../src/polynomial/misc.js';
import { Polynomial } from '../src/polynomial/polynomial.js';
import exportCalldata from '../src/sh_plonk_export_calldata.js';
import exportSolidityVerifier from '../src/sh_plonk_export_solidity_verifier.js';
import assert from "assert";

describe("Shplonk test suite", function () {
    this.timeout(1000000000);

    let curve;

    before(async () => {
        curve = await getCurveFromName("bn128");
    });

    after(async () => {
        await curve.terminate();
    });

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
                        {"name": "Z",  "stage": 2, "degree": 34},
                        {"name": "T1", "stage": 2, "degree": 33},
                        {"name": "T2", "stage": 2, "degree": 101}
                    ]
                ], 
                "extraMuls": [0,0,0],
            };
    
            const {zkey, PTau} = await setup(config, true, curve, ptauFilename);
    
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
            let c = 0;
            for(let i = 0; i < pols.length; ++i) {
                const lengthBuffer = 2 ** (log2(pols[i].degree) + 1);
                ctx[pols[i].name] = new Polynomial(new BigBuffer(lengthBuffer * sFr), curve);
                for(let j = 0; j < pols[i].degree; ++j) {
                    ctx[pols[i].name].setCoef(j, curve.Fr.e(c++));
                }
            }
    
            const committedPols = {};
    
            const commits0 = await commit(0, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits0.length; ++i) {
              committedPols[`f${commits0[i].index}`] = {commit: commits0[i].commit, pol: commits0[i].pol}
            }
    
            const commits1 = await commit(1, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits1.length; ++i) {
                committedPols[`f${commits1[i].index}`] = {commit: commits1[i].commit, pol: commits1[i].pol};  
            }
    
            const commits2 = await commit(2, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits2.length; ++i) {
              committedPols[`f${commits2[i].index}`] = {commit: commits2[i].commit, pol: commits2[i].pol};  
            }
            
            const [commitW, commitWp, evaluations, openingPoints, xiSeed] = await open(zkey, PTau, ctx, committedPols, curve);
    
            committedPols.W1 = { commit: commitW };
            committedPols.W2 = { commit: commitWp };
    
            const isValid = await verifyOpenings(zkey, committedPols, evaluations, curve);
            assert(isValid);
    
            await exportCalldata("tmp/shplonk_calldata1.txt", zkey, committedPols, evaluations, curve);
    
            for(let i = 0; i < zkey.f.length; ++i) {
                if(zkey.f[i].stages.length === 1 && zkey.f[i].stages[0].stage === 0) {
                    zkey[`f${zkey.f[i].index}`] = curve.G1.toObject(committedPols[`f${zkey.f[i].index}_0`].commit);
                }
            }
    
            await exportSolidityVerifier("tmp/shplonk_verifier1.sol", zkey, curve);
        });
    
        it("shplonk full test with scalar multiplications", async () => {
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
                    ]
                ], 
                "extraMuls": [4,2,0],
            };
    
            const {zkey, PTau} = await setup(config, true, curve, ptauFilename);
    
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
            let c = 0;
            for(let i = 0; i < pols.length; ++i) {
                const lengthBuffer = 2 ** (log2(pols[i].degree) + 1);
                ctx[pols[i].name] = new Polynomial(new BigBuffer(lengthBuffer * sFr), curve);
                for(let j = 0; j < pols[i].degree; ++j) {
                    ctx[pols[i].name].setCoef(j, curve.Fr.e(c++));
                }
            }
    
            const committedPols = {};
    
            const commits0 = await commit(0, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits0.length; ++i) {
              committedPols[`f${commits0[i].index}`] = {commit: commits0[i].commit, pol: commits0[i].pol}
            }
    
            const commits1 = await commit(1, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits1.length; ++i) {
                committedPols[`f${commits1[i].index}`] = {commit: commits1[i].commit, pol: commits1[i].pol};  
            }
    
            const commits2 = await commit(2, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits2.length; ++i) {
              committedPols[`f${commits2[i].index}`] = {commit: commits2[i].commit, pol: commits2[i].pol};  
            }
            
            const [commitW, commitWp, evaluations, openingPoints, xiSeed] = await open(zkey, PTau, ctx, committedPols, curve);
    
            committedPols.W1 = { commit: commitW };
            committedPols.W2 = { commit: commitWp };
    
            const isValid = await verifyOpenings(zkey, committedPols, evaluations, curve);
            assert(isValid);
    
            await exportCalldata("tmp/shplonk_calldata2.txt", zkey, committedPols, evaluations, curve);
    
            for(let i = 0; i < zkey.f.length; ++i) {
                if(zkey.f[i].stages.length === 1 && zkey.f[i].stages[0].stage === 0) {
                    zkey[`f${zkey.f[i].index}`] = curve.G1.toObject(committedPols[`f${zkey.f[i].index}_0`].commit);
                }
            }
    
            await exportSolidityVerifier("tmp/shplonk_verifier2.sol", zkey, curve);
        });
    });

    describe("Testing shplonk using setup by opening points",() => {
        it("shplonk full basic test with no scalar multiplications", async () => {
            const ptauFilename = path.join("test", "powersOfTau15_final.ptau");
    
            const config = {
                "power": 5,
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
                "extraMuls": [0,0,0],
            };
    
            const {zkey, PTau} = await setup(config, false, curve, ptauFilename);
    
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
            let c = 0;
            for(let i = 0; i < pols.length; ++i) {
                const lengthBuffer = 2 ** (log2(pols[i].degree) + 1);
                ctx[pols[i].name] = new Polynomial(new BigBuffer(lengthBuffer * sFr), curve);
                for(let j = 0; j < pols[i].degree; ++j) {
                    ctx[pols[i].name].setCoef(j, curve.Fr.e(c++));
                }
            }
    
            const committedPols = {};
    
            const commits0 = await commit(0, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits0.length; ++i) {
              committedPols[`f${commits0[i].index}`] = {commit: commits0[i].commit, pol: commits0[i].pol}
            }
    
            const commits1 = await commit(1, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits1.length; ++i) {
                committedPols[`f${commits1[i].index}`] = {commit: commits1[i].commit, pol: commits1[i].pol};  
            }
    
            const commits2 = await commit(2, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits2.length; ++i) {
              committedPols[`f${commits2[i].index}`] = {commit: commits2[i].commit, pol: commits2[i].pol};  
            }
    
            
            const [commitW, commitWp, evaluations, openingPoints, xiSeed] = await open(zkey, PTau, ctx, committedPols, curve);
    
            committedPols.W1 = { commit: commitW };
            committedPols.W2 = { commit: commitWp };
    
            const isValid = await verifyOpenings(zkey, committedPols, evaluations, curve);
            assert(isValid);
    
            await exportCalldata("tmp/shplonk_calldata3.txt", zkey, committedPols, evaluations, curve);
    
            for(let i = 0; i < zkey.f.length; ++i) {
                if(zkey.f[i].stages.length === 1 && zkey.f[i].stages[0].stage === 0) {
                    zkey[`f${zkey.f[i].index}`] = curve.G1.toObject(committedPols[`f${zkey.f[i].index}_0`].commit);
                }
            }
    
            await exportSolidityVerifier("tmp/shplonk_verifier3.sol", zkey, curve);
        });

        it.skip("shplonk full basic test with scalar multiplications", async () => {
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
                ], 
                "extraMuls": [0,0],
            };
    
            const {zkey, PTau} = await setup(config, false, curve, ptauFilename);
    
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
            let c = 0;
            for(let i = 0; i < pols.length; ++i) {
                const lengthBuffer = 2 ** (log2(pols[i].degree) + 1);
                ctx[pols[i].name] = new Polynomial(new BigBuffer(lengthBuffer * sFr), curve);
                for(let j = 0; j < pols[i].degree; ++j) {
                    ctx[pols[i].name].setCoef(j, curve.Fr.e(c++));
                }
            }
    
            const committedPols = {};
    
            const commits0 = await commit(0, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits0.length; ++i) {
              committedPols[`f${commits0[i].index}`] = {commit: commits0[i].commit, pol: commits0[i].pol}
            }
    
            const commits1 = await commit(1, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits1.length; ++i) {
                committedPols[`f${commits1[i].index}`] = {commit: commits1[i].commit, pol: commits1[i].pol};  
            }
    
            const commits2 = await commit(2, zkey, ctx, PTau, curve);        
            for(let i = 0; i < commits2.length; ++i) {
              committedPols[`f${commits2[i].index}`] = {commit: commits2[i].commit, pol: commits2[i].pol};  
            }
    
            
            const [commitW, commitWp, evaluations, openingPoints, xiSeed] = await open(zkey, PTau, ctx, committedPols, curve);
    
            committedPols.W1 = { commit: commitW };
            committedPols.W2 = { commit: commitWp };
    
            const isValid = await verifyOpenings(zkey, committedPols, evaluations, curve);
            assert(isValid);
    
            await exportCalldata("tmp/shplonk_calldata4.txt", zkey, committedPols, evaluations, curve);
    
            for(let i = 0; i < zkey.f.length; ++i) {
                if(zkey.f[i].stages.length === 1 && zkey.f[i].stages[0].stage === 0) {
                    zkey[`f${zkey.f[i].index}`] = curve.G1.toObject(committedPols[`f${zkey.f[i].index}_0`].commit);
                }
            }
    
            await exportSolidityVerifier("tmp/shplonk_verifier4.sol", zkey, curve);
        });
    });

    
});
