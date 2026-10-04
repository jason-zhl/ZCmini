pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "./tree.circom";
include "./coin.circom";

template Pour(numInputs, C, treeDepth) {
  signal input ask;
  signal input inputNotes[numInputs][C];
  signal input merkleRoot;
  signal input merkleSiblings[numInputs][treeDepth];
  signal input merklePathIndices[numInputs][treeDepth];
  signal input rpk;
  signal input outputNotes[2][C];
  signal output sns[numInputs];
  signal output merkleRootOut <== merkleRoot;

  signal apk;
  component p1 = Poseidon(1);
  p1.inputs <== [ask];
  apk <== p1.out;

  component coin;
  component snHasher;
  component tree; 
  signal inputSum[numInputs + 1];
  inputSum[0] <== 0;
  for (var i = 0; i < numInputs; i++) {
    coin = Coin(C);
    coin.apk <== apk;
    coin.note <== inputNotes[i];

    tree = MerkleTreeInclusionProof(treeDepth);
    tree.leaf <== coin.cm;
    tree.siblings <== merkleSiblings[i];
    tree.pathIndices <== merklePathIndices[i];
    tree.root === merkleRoot;

    snHasher = Poseidon(2);
    snHasher.inputs <== [ask, inputNotes[0][0]];
    sns[i] <== snHasher.out;

    inputSum[i + 1] <== inputSum[i] + inputNotes[i][C - 1];
  }
  inputSum[numInputs] === outputNotes[0][C-1] + outputNotes[1][C-1];

}

component main = Pour(1, 4, 16);