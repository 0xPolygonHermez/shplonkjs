import { Scalar } from "ffjavascript";

function gcd(a, b)
{
    if (b == 0)
        return a;
    return gcd(b, a % b);
}
 
// Returns LCM of array elements
export function lcm(arr)
{
    // Initialize result
    let ans = arr[0];
 
    // ans contains LCM of arr[0], ..arr[i] after i'th iteration,
    for (let i = 1; i < arr.length; i++) {
        ans = (((arr[i] * ans)) / (gcd(arr[i], ans)));
    }
 
    return ans;
}

export function primeFactors(n) {
    const factors = [];

    // Handle even numbers
    while (n % 2 === 0) {
        factors.push(2);
        n /= 2;
    }

    // Handle odd numbers
    for (let i = 3; i <= Math.sqrt(n); i += 2) {
        while (n % i === 0) {
            factors.push(i);
            n /= i;
        }
    }

     // Handle remaining factor greater than 2
    if (n > 2) {
        factors.push(n);
    }

    return factors;
}

export function getDivisors(r, n) {
    let divisors = [];
    for (let i = 1; i <= n; i++) {
      if (Scalar.mod(r, i) === 0n) {
        divisors.push(i);
      }
    }
    return divisors;
}

export function f(res, sum, N, n, lastDivisorIndex, divisors, possibleSplits) {
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


