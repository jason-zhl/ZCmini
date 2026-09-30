/**
 * In-memory commitment tree for mined output coins.
 * Each accepted block appends `utxoOuts[].cm` in transaction order.
 * Spent inputs are not inserted; those commitments are already leaves.
 * The tree is rebuilt empty when the process starts.
 */
import { IMT } from '@zk-kit/imt';
import { poseidon2 } from 'poseidon-lite';
import { bigIntToHex, hexToBigInt } from '../common/utils.js';

/** Fixed depth so every membership path has the same number of siblings. */
export const COMMITMENT_TREE_DEPTH = 16;

function createTree(depth) {
  return new IMT(poseidon2, depth, 0n, 2);
}

export class CommitmentTree {
  constructor(depth = COMMITMENT_TREE_DEPTH) {
    this.depth = depth;
    this.tree = createTree(depth);
  }

  reset() {
    this.tree = createTree(this.depth);
  }

  /** Current leaves, in append order. */
  leaves() {
    return this.tree.leaves;
  }

  /** Output field elements for a block, in append order. Commitments are already validated. */
  outputsForBlock(transactions) {
    const leaves = [];
    for (const tx of transactions) {
      for (const utxo of tx.utxoOuts) leaves.push(hexToBigInt(utxo.cm));
    }
    const capacity = this.tree.arity ** this.depth;
    if (this.tree.leaves.length + leaves.length > capacity) {
      throw new Error('Commitment tree is full');
    }
    return leaves;
  }

  insert(leaves) {
    for (const leaf of leaves) this.tree.insert(leaf);
  }

  /** Merkle path for a mined output commitment. `cm` is a field element. */
  proof(cm) {
    const index = this.tree.indexOf(cm);
    if (index < 0) {
      const err = new Error(`Commitment ${bigIntToHex(cm)} is not in the commitment tree`);
      err.code = 'NOT_FOUND';
      throw err;
    }
    const proof = this.tree.createProof(index);
    return {
      root: bigIntToHex(proof.root),
      leaf: bigIntToHex(proof.leaf),
      index: proof.leafIndex,
      pathIndices: proof.pathIndices,
      siblings: proof.siblings.map((level) => bigIntToHex(level[0])),
    };
  }
}
