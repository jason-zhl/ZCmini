// server.js
import express from 'express';
import cors from 'cors';
import * as db from './db.js';

const BLOCK_DIFFICULTY = 1;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/difficulty', (req, res) => {
  res.json({ difficulty: BLOCK_DIFFICULTY });
});

// Receive a new block
app.post('/block', async (req, res) => {
  try {
    const block = req.body;
    if (!block || typeof block !== 'object') {
      return res.status(400).json({ error: 'Body must be a block object' });
    }
    const height = await db.appendBlock(block);
    res.status(201).json({ ok: true, height });
  } catch (err) {
    console.error('POST /block', err);
    res.status(500).json({ error: err.message });
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
