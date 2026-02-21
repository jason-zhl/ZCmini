const DEFAULT_BASE_URL = 'http://localhost:3000';

/**
 * Client for talking to the blockchain server.
 */
export class ServerAPI {
  constructor(baseUrl = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(text || res.statusText);
      err.status = res.status;
      err.response = text;
      throw err;
    }
    if (!text) return null;
    return JSON.parse(text);
  }

  /** Get the current block difficulty from the server. */
  async getBlockDifficulty() {
    const data = await this.request('/difficulty');
    return data.difficulty;
  }

  /** Send a mined block and its transactions to the server. */
  async sendMinedBlock(block, transactions = []) {
    return this.request('/block', {
      method: 'POST',
      body: JSON.stringify({ block, transactions }),
    });
  }

  /** Get the full list of blocks. */
  async getBlocks() {
    const data = await this.request('/blocks');
    return data.blocks;
  }

  /** Get the latest n blocks (default 10). */
  async getLatestBlocks(n = 10) {
    const data = await this.request(`/blocks/latest?n=${encodeURIComponent(n)}`);
    return data.blocks;
  }

  /** Get the list of transactions. Optionally pass a block height to get only that block's transactions. */
  async getTransactions(blockHeight = undefined) {
    const path = blockHeight !== undefined
      ? `/transactions?blockHeight=${encodeURIComponent(blockHeight)}`
      : '/transactions';
    const data = await this.request(path);
    return data.transactions;
  }
}
