# shplonkjs

This is a **JavaScript and Pure Web Assembly library of ShPlonk commitment scheme.** It has been designed to be integrated with Fflonk protocol, although it can be used as an independent scheme.

The readme is currently WIP.

## Guide
### 0. Setup

The first step in order to use the library is to do the setup.

```js
await setup(config, curve, ptauFilename, logger);
```
The config contains the following information:
- **Power**: It is the power of two of the maximum number of constraints that the ceremony can accept
- **PolDefs**: It contains all the polynomials that are opened in each of the opening points. For each polynomial, the following information needs to be provided: *name*, *degree* and *stage*. 
- **ExtraMuls**: Extra scalar group multiplications applied to each of the stages / opening points
- **OpenBy**: Commits can be done by stage or by opening point. It can only have two values: "stage" or "openingPoints"

An example of configuration is the following: 
```json
{
    "power": 5,  //Circuit power
    "polDefs": [
        [
            {"name": "P1", "stage": 0, "degree": 32},
            {"name": "P2", "stage": 0, "degree": 32},
            {"name": "P3", "stage": 0, "degree": 32},
            {"name": "P4", "stage": 0, "degree": 32},
            {"name": "P5", "stage": 1, "degree": 33},
            {"name": "P6", "stage": 1, "degree": 33},
            {"name": "P7", "stage": 2, "degree": 34},
            {"name": "P8", "stage": 2, "degree": 33},
            {"name": "P9", "stage": 2, "degree": 101}
        ],
        [
            {"name": "P7", "stage": 2, "degree": 34},
            {"name": "P8", "stage": 2, "degree": 33},
            {"name": "P9", "stage": 2, "degree": 101}
        ],
    ], 
    "extraMuls": 3, 
    "openBy": "stage", 
}
```

Along with the configuration, the powers of tau filename needs to be provided.

Provided a config, the setup first calculates all the f_i polynomials that will be required in the shplonk protocol. Once this is done, it precomputes all the omegas (and roots) and checks that the powers of tau provided is valid. It returns the PTau and the zkey.

### 1. Commit

For each stage, f_i polynomials needs to be committed. This is done by calling the following function:

```js
await commit(stage, pk, polynomials, PTau, curve, options);
```

### 2. Open

Once the polynomials for all the stages has been committed, the opening points will be computed. All the polynomials evaluations will be calculated, along with the W and W' needed for the shplonk commitment scheme.

```js
await open(pk, PTau, polynomials, committedPols, curve, options);
```

If the protocol is applied by opening points, the f_i polynomials and its commitments calculated in the previous phase will be added to obtain the corresponding f_i

### 3. Verify openings

The verifier can check that the openings have been computed correctly by calling the following function:

```js
await verifyOpenings(vk, committedPols, evaluations, curve, options);
```

### 4. Solidity verifier

```js
await exportCalldata(vk, commits, evaluations, curve, options)
```

```js
await exportSolidityVerifier(vk, curve, options)
```

## License

Licensed under either of

* Apache License, Version 2.0, (LICENSE-APACHE or http://www.apache.org/licenses/LICENSE-2.0)
* MIT license (LICENSE-MIT or http://opensource.org/licenses/MIT)
at your option.

### Contribution
Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.

### Disclaimer
This code has not yet been audited, and should not be used in any production systems.
