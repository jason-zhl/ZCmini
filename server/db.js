import { Level } from 'level';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blocksDb = new Level(path.join(__dirname, 'data', 'blocks'), { valueEncoding: 'json' });
const transactionsDb = new Level(path.join(__dirname, 'data', 'transactions'), { valueEncoding: 'json' });

const LENGTH_KEY = 'length';

export async function getLength() {
  try {
    const n = await blocksDb.get(LENGTH_KEY);
    return Number(n);
  } catch (err) {
    if (err.code === 'LEVEL_NOT_FOUND') return 0;
    throw err;
  }
}

export async function appendBlock(block, transactions = []) {
  const length = await getLength();
  const height = length;
  const blockKey = `block_${height}`;
  await blocksDb.put(blockKey, { ...block, height });
  await blocksDb.put(LENGTH_KEY, String(height + 1));
  for (let i = 0; i < transactions.length; i++) {
    await transactionsDb.put(`${height}_${i}`, { ...transactions[i], blockHeight: height, index: i });
  }
  return height;
}

export async function getBlock(height) {
  const key = `block_${height}`;
  return await blocksDb.get(key);
}

export async function getTransactionsForBlock(height) {
  const txs = [];
  const prefix = `${height}_`;
  const nextPrefix = `${Number(height) + 1}_`;
  for await (const [key, value] of transactionsDb.iterator({ gte: prefix, lt: nextPrefix })) {
    txs.push(value);
  }
  txs.sort((a, b) => a.index - b.index);
  return txs;
}

export async function getChain() {
  const length = await getLength();
  const blocks = [];
  for (let i = 0; i < length; i++) {
    blocks.push(await getBlock(i));
  }
  return { length, blocks };
}

export async function getBlocks() {
  const { blocks } = await getChain();
  return blocks;
}

export async function getLatestBlocks(n = 10) {
  const length = await getLength();
  const count = Math.min(Math.max(0, n), length);
  const blocks = [];
  for (let i = length - count; i < length; i++) {
    blocks.push(await getBlock(i));
  }
  return blocks;
}

export async function getAllTransactions() {
  const txs = [];
  for await (const [, value] of transactionsDb.iterator()) {
    txs.push(value);
  }
  txs.sort((a, b) => a.blockHeight !== b.blockHeight ? a.blockHeight - b.blockHeight : a.index - b.index);
  return txs;
}
