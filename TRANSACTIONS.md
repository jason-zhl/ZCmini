# Transaction validity

Checks for a **mint** or **pour** before it can be treated as a real transaction. Block rules (pool membership, chain continuity, merkle root, block hash, proof of work) stay in `CONSENSUS.md`.

ZCmini is a Zerocash-style private UTXO chain: **mint** creates one coin; **pour** spends one and creates two. Mint is `utxoIns` length 0; pour is length 1. Any other length is invalid.

Shape is mempool policy, enforced by `transactionShapeCheck` in `server/validate.js` when a tx is submitted. Hash binding and the semantic checks below are the same whether the tx is still unmined or included in a block. `getTransactionHash` in `common/utils.js` returns early when `tx.hash` is set, so any check that recomputes the hash must hash the body and ignore the claimed hash.

Hashes and commitments use Poseidon. Published field elements (`cm`, `sn`, `value`, salts, hashes) are `bigIntToHex` strings: `0x` and 64 lowercase hex digits. Poseidon itself runs on integers.

Do not reject extra fields. Do not read `encrypted_secrets` for validity (note encryption is a wallet concern).

---

## Shared

Both types.

1. The transaction is a non-null object (not an array) with `metadata.tx_type` of `'mint'` or `'pour'`.
2. `utxoIns` and `utxoOuts` are arrays of objects.
3. A `hash` field is present so the tx can be stored and later matched.
4. **Recompute** the hash from the body. Do not trust `tx.hash`.
   - `input_root` starts at `0n`. For each input, `poseidon2([input_root, cm])`.
   - `output_root` starts at `0n`. For each output, `poseidon2([output_root, cm])`.
   - `snarks_root` is `0n` unless `snarks` is present, in which case it is `poseidon2([snarks.publicSignals, snarks.proof])`.
   - Hash is `bigIntToHex(poseidon3([input_root, output_root, snarks_root]))`.
5. Claimed `tx.hash` must equal that value.
5. **Zero Knowledge Structure** (TODO): If a ZK proof is present, verify that the snippet ($\pi_{\text{pour}}$) matches the expected zk-SNARK proof length and resides within the underlying elliptic curve group domain
5. **Ephemeral Key Integrity** (TODO): Check that ephemeral public keys ($pk_{\text{enc}}^{(1)}, pk_{\text{enc}}^{(2)}$) used for note ciphertext encryption are valid curve points.

### UTXO In
6. `utxoIns` must be a list of bigInts representing `sn`s
7. **Nullifier Uniqueness - Double spend**: Each `sn` is well-formed and **not** already spent (nullifier set, plus `sn`s already accepted from this block). Two inputs: `sn1 ≠ sn2`.

### UTXO Out
8. `utxoOuts` must be a list of objects, each with a `cm` and `encrypted_secrets` field only
9. **Commitment uniqueness**: Every output `cm` is not already a leaf in the commitment tree (once the tree exists). Uniqueness of new `cm`s **inside one block** is a block rule; see `CONSENSUS.md`.

---

## Mint

Creates one coin from public fields. No nullifier set, no commitment-tree membership, no Groth16 proof.

10. Zero inputs, exactly one output.
11. Commitment on the published fields:

    `cm === poseidon3([value, key_cm, cm_salt])`

    The client today uses `poseidon3([value, apk, cm_salt])` and does not put `apk` on the mint. Client and validator must use the same equation.
12. Mint does not carry a pour proof. With no `snarks` field, `snarks_root` in the hash is `0n`.

---

## Pour
13. One input (TODO: change to multiple inputs), exactly two outputs.
14. **Merkle Tree Membership**: Each spent `cm` is in the commitment tree. The proof’s merkle root `rt` is a **historical** root of that tree (a root the node has actually stored, not an arbitrary field).

### Zero-knowledge Proof Verification
15. Groth16 verify of the pour proof against the pour verifying key.
16. After success: mark the `sn`s spent and append the new `cm`s. The update is db/tree work; the accept/reject decision is the checks above.

The client currently puts `proof` and `publicSignals` on the pour, while `getTransactionHash` only folds a `snarks` object. Until those names match, the pour hash does not cover the proof.

### Not in ZCmini yet

Full Zerocash pour also checks a one-time signature over the tx body (so ciphertexts and public value cannot be swapped without breaking the signature), note ciphertexts under `pk_enc`, and a transparent basecoin balance when `v_pub ≠ 0`. None of those decide validity here. The tester circuit (`privateKey → publicKey`) is not a pour proof.
