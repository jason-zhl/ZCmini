/**
 * Validates a block before it is appended to the chain.
 * Throws an Error with a descriptive message if validation fails.
 *
 * @param {object} block - The block to validate
 * @param {object[]} transactions - The transactions included in the block
 * @param {object} context - Optional context (e.g. current chain length, previous block)
 */
export function validateBlock(block, transactions = [], context = {}) {
  if (!block || typeof block !== 'object') {
    throw new Error('Block must be a non-null object');
  }
  if (!Array.isArray(transactions)) {
    throw new Error('Transactions must be an array');
  }

  // TODO: verify block hash
  // TODO: verify proof-of-work (nonce meets difficulty)
  // TODO: verify merkle root matches hashes of transactions
  // TODO: verify previous block hash / chain continuity
  // TODO: validate each transaction (signatures, double-spend, etc.)
}
