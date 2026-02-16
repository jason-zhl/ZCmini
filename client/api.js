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
}
