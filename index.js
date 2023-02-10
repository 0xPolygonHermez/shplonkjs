
/*


precomputedPols a buffer with the prepocmputed posl row major.
The degree must be the same for all precomputed pols and the size of the buffer must match

Returns: [pk, vk]  Returns public key and verification key
*/


async function setup(curve, conig, precomputedPols) {


}

/*
    Returns a list of commits
*/

async function commit(stage, pk, ctx, pols, polsBuffer) {

}

/*
    openings is the list of opening points
    returns W,W' and evaluations
*/

async function open(pk, ctx, openingPoints) {

}

async function verifyOpenings(vk, evaluations, f, W, Wp) {

}
