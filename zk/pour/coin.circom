pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";

template Coin(C) {
  signal input apk;
  signal input note[C];
  signal keySalt <== note[0];
  signal keyCmSalt <== note[1];
  signal cmSalt <== note[2];
  signal value <== note[3];
  signal output cm;

  component keyCmHasher = Poseidon(3);
  component cmHasher = Poseidon(3);

  keyCmHasher.inputs <== [keyCmSalt, apk, keySalt];
  signal keyCm <== keyCmHasher.out;
  cmHasher.inputs <== [cmSalt, value, keyCm];
  cm <== cmHasher.out;
}