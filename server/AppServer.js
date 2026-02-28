/**
 * Core server logic (blocks, transactions, validation).
 * Can be used directly for tests without starting HTTP.
 * The Express app is a thin REST layer that calls these methods.
 *
 * Create servers with different databases:
 *   new Server({ dataDir: './data' })           // production
 *   new Server({ dataDir: '/tmp/test-db' })      // tests
 *   new Server({ db: mockDb })                   // tests with custom db
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createDb } from './db.js';
import { validateBlock } from './validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.join(__dirname, 'data');

export class Server {
  constructor({ db, dataDir, blockDifficulty = 3 } = {}) {
    if (db) {
      this.db = db;
    } else {
      this.db = createDb(dataDir ?? DEFAULT_DATA_DIR);
    }
    this.blockDifficulty = blockDifficulty;
  }

  getDifficulty() {
    return this.blockDifficulty;
  }

  async submitBlock(block, transactions = []) {
    if (!block || typeof block !== 'object') {
      throw new Error('Body must include a block object');
    }
    const txs = Array.isArray(transactions) ? transactions : [];
    const length = await this.db.getLength();
    validateBlock(block, txs, { length });
    return await this.db.appendBlock(block, txs);
  }

  async getChain() {
    return await this.db.getChain();
  }

  async getBlocks() {
    return await this.db.getBlocks();
  }

  async getLatestBlocks(n = 10) {
    return await this.db.getLatestBlocks(n);
  }

  async getBlock(height) {
    const h = Number(height);
    if (!Number.isInteger(h) || h < 0) {
      throw new Error('Invalid height');
    }
    const length = await this.db.getLength();
    if (h >= length) {
      const err = new Error('Block not found');
      err.code = 'LEVEL_NOT_FOUND';
      throw err;
    }
    return await this.db.getBlock(h);
  }

  async addUnminedTransaction(transaction) {
    if (!transaction || typeof transaction !== 'object') {
      throw new Error('Body must include a transaction object');
    }
    if (!transaction.hash) {
      throw new Error('Transaction must have a hash field');
    }
    return await this.db.addUnminedTransaction(transaction);
  }

  async getUnminedTransactions() {
    return await this.db.getUnminedTransactions();
  }

  async getTransactions(blockHeight = undefined) {
    if (blockHeight !== undefined) {
      const h = Number(blockHeight);
      if (!Number.isInteger(h) || h < 0) {
        throw new Error('Invalid block height');
      }
      return await this.db.getTransactionsForBlock(h);
    }
    return await this.db.getAllTransactions();
  }
}
