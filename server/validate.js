/**
 * Transaction shape is checked when a tx enters the mempool
 * (`transactionShapeCheck`, called from `addUnminedTransaction`).
 * `validateTransaction` checks one mint or pour. `validateBlock` checks block
 * shape, pool membership, chain continuity, merkle root, block hash, proof of
 * work, and each included transaction.
 *
 * Throws an Error with a descriptive message if validation fails.
 *
 * @param {object} block - The block to validate
 * @param {object[]} transactions - The transactions included in the block
 * @param {object} context - length, tipHash, unminedTransactions, blockDifficulty, spentSerials
 */

import { getBlockHash, getMerkleRoot, pourSerials, verifyBlockHash } from "../common/utils.js";

export const BLOCK_FIELDS = ['hash', 'previous', 'root', 'nonce'];
export const TX_FIELDS = ['utxoIns', 'utxoOuts'];
export const UTXO_IN_FIELDS = ['cm'];
export const UTXO_IN_POUR_FIELDS = ['sn'];
export const UTXO_OUT_FIELDS = ['cm'];
export const UTXO_OUT_MINT_FIELDS = ['value', 'key_cm', 'cm_salt'];

const HEX256 = /^0x[0-9a-f]{64}$/;

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function isHex256(value) {
  return typeof value === 'string' && HEX256.test(value);
}

export function transactionShapeCheck(tx, label = 'Transaction') {
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) {
    throw new Error(`${label} must be a non-null object`);
  }

  const txType = tx.metadata?.tx_type;
  if (txType !== 'mint' && txType !== 'pour') {
    throw new Error(`${label} must have metadata.tx_type of mint or pour`);
  }

  for (const field of TX_FIELDS) {
    if (!Array.isArray(tx[field])) {
      throw new Error(`${label} ${field} must be an array`);
    }
  }

  if (txType === 'mint') {
    if (tx.utxoIns.length !== 0) {
      throw new Error(`${label} mint must have no inputs`);
    }
    if (tx.utxoOuts.length !== 1) {
      throw new Error(`${label} mint must have exactly one output`);
    }
  } else {
    if (tx.utxoIns.length < 1 || tx.utxoIns.length > 2) {
      throw new Error(`${label} pour must have one or two inputs`);
    }
    if (tx.utxoOuts.length !== 2) {
      throw new Error(`${label} pour must have exactly two outputs`);
    }
  }

  const inFields = txType === 'pour' ? [...UTXO_IN_FIELDS, ...UTXO_IN_POUR_FIELDS] : UTXO_IN_FIELDS;
  for (let j = 0; j < tx.utxoIns.length; j++) {
    const utxo = tx.utxoIns[j];
    if (!utxo || typeof utxo !== 'object' || Array.isArray(utxo)) {
      throw new Error(`${label} utxoIns[${j}] must be an object`);
    }
    for (const field of inFields) {
      if (!hasValue(utxo[field])) {
        throw new Error(`${label} utxoIns[${j}] must have a ${field}`);
      }
    }
  }

  const outFields = txType === 'mint' ? [...UTXO_OUT_FIELDS, ...UTXO_OUT_MINT_FIELDS] : UTXO_OUT_FIELDS;
  for (let j = 0; j < tx.utxoOuts.length; j++) {
    const utxo = tx.utxoOuts[j];
    if (!utxo || typeof utxo !== 'object' || Array.isArray(utxo)) {
      throw new Error(`${label} utxoOuts[${j}] must be an object`);
    }
    for (const field of outFields) {
      if (!hasValue(utxo[field])) {
        throw new Error(`${label} utxoOuts[${j}] must have a ${field}`);
      }
    }
  }
}

export function validateTransaction(tx, context = {}) {
  const serials = pourSerials(tx);
  if (serials.length === 0) return;
  const accepted = context.acceptedSerials ?? [];
  assertSerialsAvailable([...accepted, ...serials], {
    spentSerials: context.spentSerials ?? [],
    unminedNullifiers: context.unminedNullifiers ?? [],
    txHash: context.txHash ?? tx?.hash,
  });
}

function assertSerialsAvailable(serials, { spentSerials = [], unminedNullifiers = [], txHash } = {}) {
  const spent = new Set();
  for (const entry of spentSerials) {
    const sn = entry?.sn ?? entry;
    if (sn != null && sn !== '') spent.add(sn);
  }
  const pending = new Map();
  for (const entry of unminedNullifiers) {
    if (entry?.sn != null && entry.sn !== '') pending.set(entry.sn, entry.txHash);
  }

  const seen = new Set();
  for (const { sn } of serials) {
    if (seen.has(sn)) {
      throw new Error(`Serial number ${sn} is repeated`);
    }
    seen.add(sn);
    if (spent.has(sn)) {
      throw new Error(`Serial number ${sn} is already spent`);
    }
    if (txHash !== undefined && pending.has(sn) && pending.get(sn) !== txHash) {
      throw new Error(`Serial number ${sn} is already in the mempool`);
    }
  }
}

export function validateBlock(block, transactions = [], context = {}) {
  // Block shape
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    throw new Error('Block must be a non-null object');
  }
  if (!Array.isArray(transactions)) {
    throw new Error('Transactions must be an array');
  }

  for (const field of BLOCK_FIELDS) {
    if (field === 'previous') {
      if (block.previous !== null && !isHex256(block.previous)) {
        throw new Error('Block previous must be null or a 0x hex string');
      }
      continue;
    }
    if (!isHex256(block[field])) {
      throw new Error(`Block ${field} must be a 0x hex string`);
    }
  }

  // Pool membership. Each included hash must still be an unmined entry.
  const remaining = new Set();
  for (const tx of context.unminedTransactions ?? []) {
    if (tx && hasValue(tx.hash)) remaining.add(tx.hash);
  }
  for (let i = 0; i < transactions.length; i++) {
    const hash = transactions[i]?.hash;
    if (!hasValue(hash) || !remaining.has(hash)) {
      throw new Error(`Transactions[${i}] must be an unmined transaction in the pool`);
    }
    remaining.delete(hash);
  }

  // Genesis, or extend the stored tip. The tip hash comes from the node.
  if (!Number.isInteger(context.length) || context.length < 0) {
    throw new Error('Block chain length must be provided by the node');
  }
  if (context.length === 0) {
    if (block.previous !== null) {
      throw new Error('Block previous must be null for the genesis block');
    }
  } else if (block.previous !== context.tipHash) {
    throw new Error('Block previous hash does not match the chain tip');
  }

  // Merkle root of the included transaction hashes.
  const blockRoot = getMerkleRoot(transactions.map(tx => tx.hash));
  if (blockRoot !== block.root) {
    throw new Error('Block root does not match calculated root');
  }

  // Block hash: Poseidon3(previous, root, nonce), as hex.
  const blockHash = getBlockHash(block);
  if (blockHash !== block.hash) {
    throw new Error('Block hash does not match calculated hash');
  }

  //Proof of work: After 0x, the next blockDifficulty hex digits must be 0.
  const difficulty = context.blockDifficulty;
  if (!Number.isInteger(difficulty) || difficulty < 0) {
    throw new Error('Block difficulty must be provided by the node');
  }
  if (!verifyBlockHash(block.hash, difficulty)) {
    throw new Error('Block hash does not meet proof of work');
  }

  const acceptedSerials = [];
  for (const tx of transactions) {
    validateTransaction(tx, {
      spentSerials: context.spentSerials ?? [],
      acceptedSerials,
    });
    acceptedSerials.push(...pourSerials(tx));
  }
}
