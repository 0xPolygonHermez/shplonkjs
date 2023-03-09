const { Scalar } = require("ffjavascript");

checkGenerator = function checkGenerator(Fr, gen, k) {
    let generator = gen;
    for(let i = 0; i < k; ++i) {
        generator = Fr.mul(generator, gen);
    }
    
    if(Fr.eq(gen, generator)) {
        return true;
    }
    return false;
}

exports.checkValidRoot = function checkValidRoot(Fr, gen, k) {
    let generator = Fr.one;
    for(let i = 0; i < k; ++i) {
        generator = Fr.mul(generator, gen);
        
    }
    
    if(Fr.eq(generator, Fr.one)) {
        return true;
    }
    return false;
}

exports.isValidGenerator = function isValidGenerator(k, value, orderRsub1, curve, factors) {
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

