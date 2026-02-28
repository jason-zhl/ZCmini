import { Level } from 'level';
import path from 'path';

const LENGTH_KEY = 'length';
const MEMPOOL_PREFIX = 'tx_';

/**
 * Create a db interface backed by Level at the given base path.
 * Use different basePath for production vs testing (e.g. temp dir or in-memory).
 *
 * @param {string} basePath - Directory for blocks/, transactions/, mempool/ subdirs
 * @returns {object} Db interface (getLength, appendBlock, getBlock, ...)
 */
export function createDb(basePath) {
  const blocksDb = new Level(path.join(basePath, 'blocks'), { valueEncoding: 'json' });
  const transactionsDb = new Level(path.join(basePath, 'transactions'), { valueEncoding: 'json' });
  const mempoolDb = new Level(path.join(basePath, 'mempool'), { valueEncoding: 'json' });

  async function getLength() {
    try {
      const n = await blocksDb.get(LENGTH_KEY);
      return Number(n);
    } catch (err) {
      if (err.code === 'LEVEL_NOT_FOUND') return 0;
      throw err;
    }
  }

  async function removeUnminedTransaction(hash) {
    try {
      await mempoolDb.del(`${MEMPOOL_PREFIX}${hash}`);
    } catch (err) {
      if (err.code !== 'LEVEL_NOT_FOUND') throw err;
    }
  }

  async function appendBlock(block, transactions = []) {
    const length = await getLength();
    const height = length;
    const blockKey = `block_${height}`;
    await blocksDb.put(blockKey, { ...block, height });
    await blocksDb.put(LENGTH_KEY, String(height + 1));
    for (let i = 0; i < transactions.length; i++) {
      await transactionsDb.put(`${height}_${i}`, { ...transactions[i], blockHeight: height, index: i });
    }
    for (const tx of transactions) {
      if (tx && tx.hash) await removeUnminedTransaction(tx.hash);
    }
    return height;
  }

  async function getBlock(height) {
    const key = `block_${height}`;
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

  async function getBlocks() {
    const { blocks } = await getChain();
    return blocks;
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
    for await (const [, value] of transactionsDb.iterator()) {
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
    await mempoolDb.put(key, { ...tx, hash });
    return hash;
  }

  async function getUnminedTransactions() {
    const txs = [];
    for await (const [, value] of mempoolDb.iterator()) {
      txs.push(value);
    }
    return txs;
  }

  return {
    getLength,
    appendBlock,
    getBlock,
    getTransactionsForBlock,
    getChain,
    getBlocks,
    getLatestBlocks,
    getAllTransactions,
    addUnminedTransaction,
    getUnminedTransactions,
    removeUnminedTransaction,
  };
}
