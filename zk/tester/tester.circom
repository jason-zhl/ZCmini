pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";

template Tester() {
    signal input privateKey;
    signal output publicKey;
    
    component pk_hasher = Poseidon(1);
    pk_hasher.inputs <== [privateKey];
    publicKey <== pk_hasher.out;
 }

 component main = Tester();
