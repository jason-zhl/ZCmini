# Consensus rules

Rules a node must enforce before appending a block. Implemented in `server/validate.js` (`validateBlock`). A block that fails any check is invalid.

In Bitcoin / Zcash this set is called **consensus rules** (as opposed to mempool *policy*). ZCmini is a Zerocash-style private UTXO chain: **mint** creates a coin; **pour** spends one and creates two.

Transaction structure is mempool policy. It is checked in `addUnminedTransaction` (`transactionShapeCheck`) when a tx is submitted. `validateBlock` does not repeat that check. It requires each included transaction to already be an unmined entry in the pool, matched by `hash`.

Hashes and commitments use Poseidon via `common/utils.js`. Published field elements are `bigIntToHex` strings: `0x` and 64 lowercase hex digits. Poseidon itself runs on integers.

Suggested order: **block shape → pool membership → previous → merkle root → block hash → proof of work → per-tx semantics**.

Transaction hash binding (recompute the hash from the body; claimed `tx.hash` must match) is shared by mint and pour. It is specified in `TRANSACTIONS.md`, not as a block check. The merkle step uses those already-bound hashes.

`AppServer.submitBlock` passes `{ length, unminedTransactions }`. Continuity needs the tip hash; PoW needs `blockDifficulty`; pour needs the commitment tree, spent serial-number set, and verifying key.

---

## Mempool admission (policy)

Status: implemented in `transactionShapeCheck`, called from `addUnminedTransaction`.

1. The transaction is a non-null object (not an array). `utxoIns` length is 0 (mint) or 1 (pour). Any other length is invalid.
2. `utxoIns` and `utxoOuts` are arrays of objects.
3. **Mint:** zero inputs, exactly one output. Output has `value`, `key_cm`, `cm_salt`, `cm`.
4. **Pour:** one input, exactly two outputs. The input is an `sn`. Each output has `cm`.
5. A `hash` field is required so the tx can be stored and later matched at block validation.

Do not reject extra fields. Do not read `encrypted_secrets` for validity (note encryption is a later wallet concern).

---

## 0. Block shape and pool membership

Status: block fields in `blockShapeCheck`. Pool membership in `unminedPoolCheck`.

6. `block` is a non-null object (not an array).
7. `transactions` is an array.
8. Block fields `hash`, `root`, and `nonce` are `0x` hex strings of 64 digits (`bigIntToHex`). `previous` is `null` (genesis) or the same kind of hash.
9. Each included transaction's `hash` is an unmined pool entry passed in `context.unminedTransactions`.

---

## 1. Block values

10. **Genesis Block** : If the chain is empty and this is the genesis block, `previous` must be `null`.
11. **Previous** : Otherwise, `block.previous` equals the stored tip’s `hash` (passed in by the node; do not trust the client). This node only extends the unique tip. No forks or skips.

Hash binding is a transaction rule, the same for mint and pour. See `TRANSACTIONS.md`. `getTransactionHash` returns early if `tx.hash` is set, so that check hashes the body itself. This section only merkle-izes hashes that already match their bodies.

14. **Root** : `block.root` must equal the Merkle root of transaction hashes, as a `0x` hex string: empty → `bigIntToHex(0n)`; one leaf → that hash; otherwise pairwise Poseidon, odd leaf duplicated, then `bigIntToHex`.
15. **Block hash** : Block hash must be equal to a combined hash of block object attributes, specifically the hexidecimal representation of Poseidon3(`previous`, `root`, `nonce`)
16. **Proof of work** : After `0x`, the next `difficulty` hex digits must be `0`. Difficulty comes from the node (`blockDifficulty`), not the client.

Merkle, then block hash, then PoW, so a valid-looking nonce cannot paper over a wrong root.
---

## 5. Per-tx rules

Status: not enforced yet. Shape is mempool policy. Hash binding and mint/pour semantics are specified in `TRANSACTIONS.md`. `validateBlock` still requires each included tx to already be in the pool.

TODO: New output `cm` values **in this block** must be unique. “Not already in the commitment tree” is a transaction check (`TRANSACTIONS.md`).

---

## Context `AppServer` must pass

| Check | Needs |
|---|---|
| Pool membership | current unmined transactions |
| Continuity | tip `hash` |
| PoW | `blockDifficulty` |
| Tx hash binding | tx body only (`TRANSACTIONS.md`; shared by mint and pour) |
| Mint commitment | tx body only |
| Pour double-spend / membership / snark | spent `sn` set, commitment tree / roots, verifying key |

---

## Not consensus (yet)

- Mempool admission (`POST /transaction`) is **policy**: transaction shape plus a `hash`. Hash binding (claimed hash equals the body) is a transaction rule in `TRANSACTIONS.md`. Block validation then checks that hash is still in the pool and merkle-izes it.
- Note encryption (BabyJubJub) and wallet scan do not affect whether a block is valid.
- The tester circuit (`privateKey → publicKey`) is not a pour proof and must not be treated as one.
