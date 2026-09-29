import { Level } from 'level';
import path from 'path';
import { pourSerials } from '../common/utils.js';

const BLOCK_PREFIX = 'block_';
const BLOCK_RANGE_LT = 'block_~';
const MEMPOOL_PREFIX = 'mp_';
const MEMPOOL_RANGE_LT = 'mq';
const NULLIFIER_PREFIX = 'sn_';
const NULLIFIER_RANGE_LT = 'so';

/**
 * Create a db interface backed by Level at the given base path.
 * Use different basePath for production vs testing (e.g. temp dir or in-memory).
 *
 * Nullifiers use one database and two key spaces, same as transactions:
 * mined serials are `sn_${sn}`, mempool serials are `mp_${sn}`.
 *
 * @param {string} basePath - Directory for blocks/, transactions/, and nullifiers/
 * @returns {object} Db interface (getLength, appendBlock, getBlock, ...)
 */
export function createDb(basePath) {
  const blocksDb = new Level(path.join(basePath, 'blocks'), { valueEncoding: 'json' });
  const transactionsDb = new Level(path.join(basePath, 'transactions'), { valueEncoding: 'json' });
  const nullifiersDb = new Level(path.join(basePath, 'nullifiers'), { valueEncoding: 'json' });

  async function addUnminedNullifiers(tx) {
    for (const { sn, inputIndex } of pourSerials(tx)) {
      await nullifiersDb.put(`${MEMPOOL_PREFIX}${sn}`, { sn, txHash: tx.hash, inputIndex });
    }
  }

  async function commitNullifiers(transactions, height) {
    for (let txIndex = 0; txIndex < transactions.length; txIndex++) {
      const tx = transactions[txIndex];
      for (const { sn, inputIndex } of pourSerials(tx)) {
        await nullifiersDb.put(`${NULLIFIER_PREFIX}${sn}`, {
          sn,
          txHash: tx?.hash,
          blockHeight: height,
          txIndex,
          inputIndex,
        });
        try {
          await nullifiersDb.del(`${MEMPOOL_PREFIX}${sn}`);
        } catch (err) {
          if (err.code !== 'LEVEL_NOT_FOUND') throw err;
        }
      }
    }
  }

  async function getNullifiers() {
    const serials = [];
    for await (const [, value] of nullifiersDb.iterator({ gte: NULLIFIER_PREFIX, lt: NULLIFIER_RANGE_LT })) {
      serials.push(value);
    }
    serials.sort((a, b) => a.blockHeight - b.blockHeight || a.txIndex - b.txIndex || a.inputIndex - b.inputIndex);
    return serials;
  }

  async function getUnminedNullifiers() {
    const serials = [];
    for await (const [, value] of nullifiersDb.iterator({ gte: MEMPOOL_PREFIX, lt: MEMPOOL_RANGE_LT })) {
      serials.push(value);
    }
    return serials;
  }

  async function getLength() {
    let count = 0;
    for await (const _ of blocksDb.keys({ gte: BLOCK_PREFIX, lt: BLOCK_RANGE_LT })) {
      count += 1;
    }
    return count;
  }

  async function removeUnminedTransaction(hash) {
    try {
      await transactionsDb.del(`${MEMPOOL_PREFIX}${hash}`);
    } catch (err) {
      if (err.code !== 'LEVEL_NOT_FOUND') throw err;
    }
  }

  async function appendBlock(block, transactions = []) {
    const length = await getLength();
    const height = length;
    const blockKey = `block_${height}`;
    await blocksDb.put(blockKey, { ...block, height });
    for (let i = 0; i < transactions.length; i++) {
      await transactionsDb.put(`${height}_${i}`, { ...transactions[i], blockHeight: height, index: i });
    }
    for (const tx of transactions) {
      if (tx && tx.hash) await removeUnminedTransaction(tx.hash);
    }
    await commitNullifiers(transactions, height);
    return height;
  }

  async function getBlock(height) {
    const key = `${BLOCK_PREFIX}${height}`;
    return await blocksDb.get(key);
  }

  async function getTransactionsForBlock(height) {
    const txs = [];
    const prefix = `${height}_`;
    const nextPrefix = `${Number(height) + 1}_`;
    for await (const [, value] of transactionsDb.iterator({ gte: prefix, lt: nextPrefix })) {
      txs.push(value);
    }
    txs.sort((a, b) => a.index - b.index);
    return txs;
  }

  async function getChain() {
    const length = await getLength();
    const blocks = [];
    for (let i = 0; i < length; i++) {
      blocks.push(await getBlock(i));
    }
    return { length, blocks };
  }

  async function getLatestBlocks(n = 10) {
    const length = await getLength();
    const count = Math.min(Math.max(0, n), length);
    const blocks = [];
    for (let i = length - count; i < length; i++) {
      blocks.push(await getBlock(i));
    }
    return blocks;
  }

  async function getAllTransactions() {
    const txs = [];
    for await (const [key, value] of transactionsDb.iterator()) {
      if (key.startsWith(MEMPOOL_PREFIX)) continue;
      txs.push(value);
    }
    txs.sort((a, b) => a.blockHeight !== b.blockHeight ? a.blockHeight - b.blockHeight : a.index - b.index);
    return txs;
  }

  async function addUnminedTransaction(tx) {
    const hash = tx?.hash;
    if (hash == null || typeof hash !== 'string') {
      throw new Error('Transaction must have a hash field');
    }
    const key = `${MEMPOOL_PREFIX}${hash}`;
    await addUnminedNullifiers(tx);
    await transactionsDb.put(key, { ...tx, hash });
    return hash;
  }

  async function getUnminedTransactions() {
    const txs = [];
    for await (const [, value] of transactionsDb.iterator({ gte: MEMPOOL_PREFIX, lt: MEMPOOL_RANGE_LT })) {
      txs.push(value);
    }
    return txs;
  }

  async function clear() {
    await blocksDb.clear();
    await transactionsDb.clear();
    await nullifiersDb.clear();
  }

  async function close() {
    await blocksDb.close();
    await transactionsDb.close();
    await nullifiersDb.close();
  }

  return {
    getLength,
    appendBlock,
    getBlock,
    getTransactionsForBlock,
    getChain,
    getLatestBlocks,
    getAllTransactions,
    addUnminedTransaction,
    getUnminedTransactions,
    removeUnminedTransaction,
    getNullifiers,
    getUnminedNullifiers,
    clear,
    close,
  };
}
