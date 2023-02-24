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

    it("shplonk full test", async () => {
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
            "extraMuls": [0,0,0],
            "stages": 3,
        };

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
        let c = 0;
        for(let i = 0; i < pols.length; ++i) {
            const lengthBuffer = 2 ** (log2(pols[i].degree) + 1);
            ctx[pols[i].name] = new Polynomial(new BigBuffer(lengthBuffer * sFr), curve);
            for(let j = 0; j < pols[i].degree; ++j) {
                ctx[pols[i].name].setCoef(j, curve.Fr.e(c++));
            }
        }

        const comittedPols = {};

        const commits0 = await commit(0, zkey, ["QL", "QR", "QM", "QO", "QC", "Sigma1", "Sigma2", "Sigma3"], ctx, PTau, curve);        
        for(let i = 0; i < commits0.length; ++i) {
          comittedPols[`f${commits0[i].index}`] = commits0[i].commit;  
        }

        const commits1 = await commit(1, zkey, ["A", "B", "C", "T0"], ctx, PTau, curve);        
        for(let i = 0; i < commits1.length; ++i) {
            comittedPols[`f${commits1[i].index}`] = commits1[i].commit;  
        }

        const commits2 = await commit(2, zkey, ["Z", "T1", "T2"], ctx, PTau, curve);        
        for(let i = 0; i < commits2.length; ++i) {
          comittedPols[`f${commits2[i].index}`] = commits2[i].commit;  
        }

        //Calculate random xiSeed
        const transcript = new Keccak256Transcript(curve);
        for(let i = 0; i < Object.keys(comittedPols).length; ++i) {
            transcript.addPolCommitment(comittedPols[Object.keys(comittedPols)[i]]);
        }

        const xiSeed = transcript.getChallenge();
        
        const [commitW, commitWp, evaluations, openingPoints] = await open(xiSeed, zkey, PTau, ctx, comittedPols, curve);

        comittedPols.W1 = commitW;
        comittedPols.W2 = commitWp;

        const isValid = await verifyOpenings(zkey, xiSeed, comittedPols, evaluations, curve);
        assert(isValid);

        const shPlonkCalldata = await exportCalldata(zkey, xiSeed, comittedPols, evaluations, curve);

        for(let i = 0; i < zkey.f.length; ++i) {
            if(!zkey.f[i].includedProof) {
                zkey[`f${zkey.f[i].index}`] = curve.G1.toObject(comittedPols[`f${zkey.f[i].index}`]);
            }
        }

        await exportSolidityVerifier(zkey, xiSeed, curve);
    });
});
