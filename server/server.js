// server.js
import express from 'express';
import cors from 'cors';
import * as db from './db.js';
import { validateBlock } from './validate.js';

const BLOCK_DIFFICULTY = 3;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/difficulty', (req, res) => {
  res.json({ difficulty: BLOCK_DIFFICULTY });
});

// Receive a new mined block and its transactions
app.post('/block', async (req, res) => {
  try {
    const { block, transactions } = req.body ?? {};
    if (!block || typeof block !== 'object') {
      return res.status(400).json({ error: 'Body must include a block object' });
    }
    const txs = Array.isArray(transactions) ? transactions : [];
    const length = await db.getLength();
    validateBlock(block, txs, { length });
    const height = await db.appendBlock(block, txs);
    res.status(201).json({ ok: true, height });
  } catch (err) {
    console.error('POST /block', err);
    const status = err.message?.startsWith('Block ') || err.message?.startsWith('Transactions ')
      ? 400
      : 500;
    res.status(status).json({ error: err.message });
  }
});

// Get full chain
app.get('/chain', async (req, res) => {
  try {
    const chain = await db.getChain();
    res.json(chain);
  } catch (err) {
    console.error('GET /chain', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all blocks
app.get('/blocks', async (req, res) => {
  try {
    const blocks = await db.getBlocks();
    res.json({ blocks });
  } catch (err) {
    console.error('GET /blocks', err);
    res.status(500).json({ error: err.message });
  }
});

// Get latest n blocks (default 10)
app.get('/blocks/latest', async (req, res) => {
  try {
    const n = Math.max(0, parseInt(req.query.n, 10) || 10);
    const blocks = await db.getLatestBlocks(n);
    res.json({ blocks });
  } catch (err) {
    console.error('GET /blocks/latest', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all transactions, optionally filtered by block height
app.get('/transactions', async (req, res) => {
  try {
    const blockHeight = req.query.blockHeight;
    const transactions = blockHeight !== undefined
      ? await db.getTransactionsForBlock(Number(blockHeight))
      : await db.getAllTransactions();
    res.json({ transactions });
  } catch (err) {
    console.error('GET /transactions', err);
    res.status(500).json({ error: err.message });
  }
});

// Get block by height
app.get('/block/:height', async (req, res) => {
  try {
    const height = Number(req.params.height);
    if (!Number.isInteger(height) || height < 0) {
      return res.status(400).json({ error: 'Invalid height' });
    }
    const length = await db.getLength();
    if (height >= length) {
      return res.status(404).json({ error: 'Block not found' });
    }
    const block = await db.getBlock(height);
    res.json(block);
  } catch (err) {
    if (err.code === 'LEVEL_NOT_FOUND') {
      return res.status(404).json({ error: 'Block not found' });
    }
    console.error('GET /block/:height', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Hello!');
});

app.listen(3000, () => {
  console.log('✅ Server running at http://localhost:3000');
});
