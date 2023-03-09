import { Scalar } from "ffjavascript";
import { primeFactors } from "../utils.js";

export function checkGenerator(Fr, gen, k) {
    let generator = gen;
    for(let i = 0; i < k; ++i) {
        generator = Fr.mul(generator, gen);
    }
    
    if(Fr.eq(gen, generator)) {
        return true;
    }
    return false;
}

export function checkValidRoot(Fr, gen, k) {
    let generator = Fr.one;
    for(let i = 0; i < k; ++i) {
        generator = Fr.mul(generator, gen);
        
    }
    
    if(Fr.eq(generator, Fr.one)) {
        return true;
    }
    return false;
}

export function calculateGenerator(orderRsub1, k, curve){
    let value = curve.Fr.two;

    const p = {
        "2": 28,
        "3": 2,
        "13": 1,
        "983": 1,
        "11003": 1,
        "237073": 1,
        "406928799": 1,
        "1670836401704629": 1,
        "13818364434197438864469338081": 1,
    }

    const factors = [];
    for(let i = 0; i < Object.keys(p).length; ++i) {
        const num = Object.keys(p)[i];
        factors.push(Scalar.pow(num, p[num]));
    }

    while(!isValidGenerator(k, value, orderRsub1, curve, factors)) {
        value = curve.Fr.add(value, curve.Fr.one);
    }

    let exponent = Scalar.div(orderRsub1, Scalar.e(k));
    let gen = curve.Fr.exp(value, exponent);

    return gen;
}

export function calculateRoot(orderRsub1, k, curve) {     
    const p = {
        "2": 28,
        "3": 2,
        "13": 1,
        "983": 1,
        "11003": 1,
        "237073": 1,
        "406928799": 1,
        "1670836401704629": 1,
        "13818364434197438864469338081": 1,
    }

    let nFactors = primeFactors(k);
    for(let i = 0; i < nFactors.length; ++i) {
        if(!p[nFactors[i]]) p[nFactors[i]] = 0;
        ++p[nFactors[i]];
    }

    const factors = [];
    for(let i = 0; i < Object.keys(p).length; ++i) {
        const num = Object.keys(p)[i];
        factors.push(Scalar.pow(num, p[num]));
    }

    let value = curve.Fr.two;
    const orderRsub1Extended = Scalar.mul(Scalar.e(k), orderRsub1);
    while(!isValidGenerator(k, value, orderRsub1Extended, curve, factors)) {
        value = curve.Fr.add(value, curve.Fr.one);
    }

    return value;
}

function isValidGenerator(k, value, orderRsub1, curve, factors) {
    for(let i = 0; i < factors.length; ++i) {
        const power = Scalar.div(orderRsub1, factors[i]);
        const exponent = Scalar.mul(Scalar.e(k), power);
        const x = curve.Fr.exp(value, exponent);
        if(curve.Fr.eq(x, curve.Fr.one)) {
            return false;
        } 
    }
    return true;
}

