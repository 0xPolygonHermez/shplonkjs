

async function plonk() {

    // Setup Phase
    const n = n
    const config = {
        polDefs:
            [
                [
                    {name: "ql", deg: n, stage: 0},
                    {name: "qr", deg: n, stage: 0},
                    {name: "qo", deg: n, stage: 0},
                    {name: "qm", deg: n, stage: 0},
                    {name: "qc", deg: n, stage: 0},
                    {name: "Sa", deg: n, stage: 0},
                    {name: "Sb", deg: n, stage: 0},
                    {name: "Sc", deg: n, stage: 0},
                    {name: "a", deg: n, stage: 1},
                    {name: "b", deg: n, stage: 1},
                    {name: "c", deg: n, stage: 1},
                    {name: "z", deg: n, stage: 2},
                    {name: "q0", deg: n, stage: 3},
                    {name: "q1", deg: n, stage: 3},
                    {name: "q2", deg: n, stage: 3},
                    {name: "q3", deg: n, stage: 3},
                ],
                [
                    {name: "z", deg: n, stage: 2},
                ]
            ],
        extraScalarMuls: 0
    };

    let plonkSetup = plokSetup(r1cs);

    [plonkSetup.provingKey, plonkSetup.provingKey] = await shPlonk.setup(curve, config);

    const ctx = {};
    plonkSetup.verificationgKey.commitConst = await shPlonk.commit(0, plonkSetup.provingKey, ctx, constPols);

    plonkSetup.provingKey.ctx = ctx;

    /*
    let [Sa, Sb, Sc, Ql, Qr, Qo, Qm, Qc] = plokSetup(r1cs);

    const setup = await shPlonk.setup(config, [Sa, Sb, Sc, Ql, Qr, Qo, Qm, Qc]);
    */

    // Proof

    ctx = plonkSetup.provingKey.ctx;

    abcPols = plonkGenerateABC(plonkSetup, input);

    const commitsABC = await shPlonk.commit(1, plonkSetup.provingKey, ctx, abcPols)

    zPol = plonkGenerateZ(plonkSetup, abcPols);

    const commitsZ = await shPlonk.commit(2, plonkSetup.provingKey, ctx, [zPol]);

    qPols= plonkGenerateQ(plonkSetup, abcPols, zPol);

    const commitsQ = await shPlonk.commit(3, plonkSetup.provingKey, ctx, qPols);

    const openingPoints = plonkGenerateOpeningPoints();

    const [evaluations, W, Wp] = await shPlonk.open(plonkSetup.provingKey, ctx, openingPoints);

    // plonk ......


    // Verification phase

    plonkVerifyConstrains()

    const f = plonkSetup.verificationgKey.commitConst;

    for (let i=0; i<commitsABC.length; i++) {
        if (commitsABC[i]) f[i] = curve.G1.add(f[i], commitsABC[i]);
        if (commitsZ[i]) f[i] = curve.G1.add(f[i], commitsZ[i]);
        if (commitsQ[i]) f[i] = curve.G1.add(f[i], commitsQ[i]);
    }

    if (! await shPlonk.verifyOpenings(plonkSetup.verificationKey, evaluations, f, W, Wp)) {
        throw new Error("Invalid proof");
    }


}