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

