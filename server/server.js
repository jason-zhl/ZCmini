// server.js – Express REST layer wrapping a Server instance
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { Server } from './AppServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = new Server({ dataDir: path.join(__dirname, 'data'), blockDifficulty: 3 });

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/difficulty', (req, res) => {
  res.json({ difficulty: server.getDifficulty() });
});

app.post('/block', async (req, res) => {
  try {
    const { block, transactions } = req.body ?? {};
    const height = await server.submitBlock(block, transactions);
    res.status(201).json({ ok: true, height });
  } catch (err) {
    console.error('POST /block', err);
    const status = err.message?.startsWith('Block ') || err.message?.startsWith('Transactions ') || err.message?.startsWith('Body ')
      ? 400
      : 500;
    res.status(status).json({ error: err.message });
  }
});

app.get('/chain', async (req, res) => {
  try {
    const chain = await server.getChain();
    res.json(chain);
  } catch (err) {
    console.error('GET /chain', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/blocks', async (req, res) => {
  try {
    const blocks = await server.getBlocks();
    res.json({ blocks });
  } catch (err) {
    console.error('GET /blocks', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/blocks/latest', async (req, res) => {
  try {
    const n = Math.max(0, parseInt(req.query.n, 10) || 10);
    const blocks = await server.getLatestBlocks(n);
    res.json({ blocks });
  } catch (err) {
    console.error('GET /blocks/latest', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/transactions/unmined', async (req, res) => {
  try {
    const transactions = await server.getUnminedTransactions();
    res.json({ transactions });
  } catch (err) {
    console.error('GET /transactions/unmined', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/transaction', async (req, res) => {
  try {
    const transaction = req.body?.transaction ?? req.body;
    const hash = await server.addUnminedTransaction(transaction);
    res.status(201).json({ ok: true, hash });
  } catch (err) {
    console.error('POST /transaction', err);
    const status = err.message?.startsWith('Body ') || err.message?.startsWith('Transaction ')
      ? 400
      : 500;
    res.status(status).json({ error: err.message });
  }
});

app.get('/transactions', async (req, res) => {
  try {
    const blockHeight = req.query.blockHeight !== undefined
      ? Number(req.query.blockHeight)
      : undefined;
    const transactions = await server.getTransactions(blockHeight);
    res.json({ transactions });
  } catch (err) {
    console.error('GET /transactions', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/block/:height', async (req, res) => {
  try {
    const height = Number(req.params.height);
    const block = await server.getBlock(height);
    res.json(block);
  } catch (err) {
    if (err.code === 'LEVEL_NOT_FOUND') {
      return res.status(404).json({ error: 'Block not found' });
    }
    if (err.message === 'Invalid height') {
      return res.status(400).json({ error: err.message });
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
