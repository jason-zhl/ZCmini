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
import { CommitmentTree } from './commitmentTree.js';
import { createDb } from './db.js';
import { commitmentField, validateBlock, validateTransaction } from './validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.join(__dirname, 'data');

export class Server {
  constructor({ db, dataDir, blockDifficulty = 1 } = {}) {
    if (db) {
      this.db = db;
    } else {
      this.db = createDb(dataDir ?? DEFAULT_DATA_DIR);
    }
    this.blockDifficulty = blockDifficulty;
    this.commitments = new CommitmentTree();
  }

  resetCommitments() {
    this.commitments.reset();
  }

  getDifficulty() {
    return this.blockDifficulty;
  }

  async close() {
    await this.db.close?.();
  }

  /** Blockchain functions */
  /** ------------------------------------------------------------ */
  async submitBlock(block, transactions = []) {
    if (!block || typeof block !== 'object') {
      throw new Error('Body must include a block object');
    }
    const length = await this.db.getLength();
    const unminedTransactions = await this.db.getUnminedTransactions();
    const spentSerials = await this.db.getNullifiers();
    const tipHash = length === 0 ? null : (await this.db.getBlock(length - 1)).hash;
    await validateBlock(block, transactions, {
      length,
      tipHash,
      unminedTransactions,
      blockDifficulty: this.blockDifficulty,
      spentSerials,
      commitmentLeaves: this.commitments.leaves(),
    });
    const leaves = this.commitments.outputsForBlock(transactions);
    const height = await this.db.appendBlock(block, transactions);
    this.commitments.insert(leaves);
    return height;
  }

  /** Merkle path for a mined output commitment. `cm` is a 0x hex string or bigint. */
  getCommitmentProof(cm) {
    return this.commitments.proof(commitmentField(cm));
  }

  async getChain() {
    return await this.db.getChain();
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

  /** Transaction/Mempool functions */
  /** ------------------------------------------------------------ */
  async addUnminedTransaction(transaction) {
    if (!transaction || typeof transaction !== 'object') {
      throw new Error('Body must include a transaction object');
    }
    await validateTransaction(transaction, {
      spentSerials: await this.db.getNullifiers(),
      unminedNullifiers: await this.db.getUnminedNullifiers(),
    });
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

  /** Spent and mempool serial numbers */
  /** ------------------------------------------------------------ */
  async getNullifiers() {
    return await this.db.getNullifiers();
  }

  async getUnminedNullifiers() {
    return await this.db.getUnminedNullifiers();
  }
}
