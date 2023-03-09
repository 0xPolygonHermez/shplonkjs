const { Scalar } = require("ffjavascript");

function gcd(a, b)
{
    if (b == 0)
        return a;
    return gcd(b, a % b);
}
 
// Returns LCM of array elements
exports.lcm = function lcm(arr)
{
    // Initialize result
    let ans = arr[0];
 
    // ans contains LCM of arr[0], ..arr[i] after i'th iteration,
    for (let i = 1; i < arr.length; i++) {
        ans = (((arr[i] * ans)) / (gcd(arr[i], ans)));
    }
 
    return ans;
}

exports.getDivisors = function getDivisors(r, n) {
    let divisors = [];
    for (let i = 1; i <= n; i++) {
      if (Scalar.mod(r, i) === 0n) {
        divisors.push(i);
      }
    }
    return divisors;
}

exports.log2 = function log2( V )
{
    return( ( ( V & 0xFFFF0000 ) !== 0 ? ( V &= 0xFFFF0000, 16 ) : 0 ) | ( ( V & 0xFF00FF00 ) !== 0 ? ( V &= 0xFF00FF00, 8 ) : 0 ) | ( ( V & 0xF0F0F0F0 ) !== 0 ? ( V &= 0xF0F0F0F0, 4 ) : 0 ) | ( ( V & 0xCCCCCCCC ) !== 0 ? ( V &= 0xCCCCCCCC, 2 ) : 0 ) | ( ( V & 0xAAAAAAAA ) !== 0 ) );
}

exports.f = function f(res, sum, N, n, lastDivisorIndex, divisors, possibleSplits) {
    if(res.length === n && sum === N) {
        possibleSplits.push(res);
        return;
    }

    for(let i = lastDivisorIndex; i < divisors.length; ++i) {
        const partialSum = sum + divisors[i];
        if(partialSum <= N && N - partialSum >= n - (res.length + 1)) {
            f([...res, divisors[i]], partialSum, N, n, i, divisors, possibleSplits);
        }
    }

    return;
}


