import { Level } from 'level';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Level(path.join(__dirname, 'data', 'chain'), { valueEncoding: 'json' });

const LENGTH_KEY = 'length';

export async function getLength() {
  try {
    const n = await db.get(LENGTH_KEY);
    return Number(n);
  } catch (err) {
    if (err.code === 'LEVEL_NOT_FOUND') return 0;
    throw err;
  }
}

export async function appendBlock(block) {
  const length = await getLength();
  const height = length;
  const key = `block_${height}`;
  await db.put(key, { ...block, height });
  await db.put(LENGTH_KEY, String(height + 1));
  return height;
}

export async function getBlock(height) {
  const key = `block_${height}`;
  return await db.get(key);
}

export async function getChain() {
  const length = await getLength();
  const blocks = [];
  for (let i = 0; i < length; i++) {
    blocks.push(await getBlock(i));
  }
  return { length, blocks };
}
