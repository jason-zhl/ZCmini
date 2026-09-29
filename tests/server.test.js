import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Server } from '../server/AppServer.js';
import { createDb } from '../server/db.js';
import { bigIntToHex, findNonce, getBlockHash, getMerkleRoot, verifyBlockHash } from '../common/utils.js';

function mintTx(hash, cm = '0x1') {
  return {
    hash,
    metadata: { tx_type: 'mint' },
    utxoIns: [],
    utxoOuts: [{ value: 1, key_cm: '0x2', cm_salt: '0x3', cm }],
  };
}

function pourTx(hash, sns = ['sn-1']) {
  return {
    hash,
    metadata: { tx_type: 'pour' },
    utxoIns: sns.map((sn) => ({ cm: `cm-${sn}`, sn })),
    utxoOuts: [{ cm: 'out-1' }, { cm: 'out-2' }],
  };
}

function mineBlock(transactions, previous, difficulty) {
  const block = {
    previous,
    root: getMerkleRoot(transactions.map((tx) => tx.hash)),
    nonce: '0x0',
    hash: null,
  };
  block.nonce = findNonce(block, difficulty);
  block.hash = getBlockHash(block);
  return block;
}

describe('Server', () => {
  let server;
  let db;
  let dataDir;

  before(() => {
    dataDir = path.join(os.tmpdir(), `zcmini-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    db = createDb(dataDir);
    server = new Server({ db, blockDifficulty: 3 });
  });

  beforeEach(async () => {
    await db.clear();
  });

  after(async () => {
    try {
      await server.close();
    } finally {
      await fs.promises.rm(dataDir, { recursive: true, force: true });
    }
  });

  describe('blocks', () => {
    describe('getDifficulty', () => {
      it('returns configured block difficulty', () => {
        expect(server.getDifficulty()).to.equal(3);
      });
    });

    describe('submitBlock', () => {
      it('accepts a valid block and returns height 0', async () => {
        const block = mineBlock([], null, server.getDifficulty());
        const height = await server.submitBlock(block, []);
        expect(height).to.equal(0);
      });

      it('stores block and returns it from getBlock', async () => {
        const block = mineBlock([], null, server.getDifficulty());
        await server.submitBlock(block, []);
        const got = await server.getBlock(0);
        expect(got).to.include({ height: 0, hash: block.hash });
      });

      it('rejects when block is missing', async () => {
        try {
          await server.submitBlock(null, []);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('block');
        }
      });

      it('rejects a genesis block whose previous hash is set', async () => {
        const block = mineBlock([], null, server.getDifficulty());
        block.previous = block.hash;
        try {
          await server.submitBlock(block, []);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('genesis');
        }
      });

      it('rejects a block field that is not a 0x hex string', async () => {
        try {
          await server.submitBlock({ hash: '0x1', previous: null, root: '0x2', nonce: '0' }, []);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('hex');
        }
      });

      it('rejects a transaction that is not in the pool', async () => {
        const block = {
          hash: '0x' + '11'.repeat(32),
          previous: null,
          root: '0x' + '22'.repeat(32),
          nonce: '0x' + '00'.repeat(32),
        };
        try {
          await server.submitBlock(block, [mintTx('0x11')]);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('unmined');
        }
      });

      it('accepts a transaction that is in the pool', async () => {
        const tx = mintTx('0x' + '11'.repeat(32));
        await server.addUnminedTransaction(tx);
        const block = mineBlock([tx], null, server.getDifficulty());
        const height = await server.submitBlock(block, [tx]);
        expect(height).to.equal(0);
      });

      it('rejects a block that does not extend the chain tip', async () => {
        const first = mineBlock([], null, server.getDifficulty());
        await server.submitBlock(first, []);
        const second = mineBlock([], '0x' + 'ab'.repeat(32), server.getDifficulty());
        try {
          await server.submitBlock(second, []);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('tip');
        }
      });

      it('rejects a block whose hash does not meet proof of work', async () => {
        const difficulty = server.getDifficulty();
        let block;
        for (let nonce = 1n; nonce < 64n; nonce++) {
          block = {
            previous: null,
            root: getMerkleRoot([]),
            nonce: bigIntToHex(nonce),
            hash: null,
          };
          block.hash = getBlockHash(block);
          if (!verifyBlockHash(block.hash, difficulty)) break;
        }
        try {
          await server.submitBlock(block, []);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('proof of work');
        }
      });
    });

    describe('getChain', () => {
      it('returns empty chain when no blocks', async () => {
        const chain = await server.getChain();
        expect(chain).to.deep.equal({ length: 0, blocks: [] });
      });

      it('returns blocks after submitBlock', async () => {
        const first = mineBlock([], null, server.getDifficulty());
        const second = mineBlock([], first.hash, server.getDifficulty());
        await server.submitBlock(first, []);
        await server.submitBlock(second, []);
        const { length, blocks } = await server.getChain();
        expect(length).to.equal(2);
        expect(blocks).to.have.lengthOf(2);
        expect(blocks[0].hash).to.equal(first.hash);
        expect(blocks[1].hash).to.equal(second.hash);
      });
    });

    describe('getBlock', () => {
      it('throws for invalid height', async () => {
        try {
          await server.getBlock(-1);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.equal('Invalid height');
        }
      });

      it('throws for height >= length', async () => {
        try {
          await server.getBlock(0);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.code).to.equal('LEVEL_NOT_FOUND');
        }
      });
    });
  });

  describe('transactions', () => {
    describe('addUnminedTransaction / getUnminedTransactions', () => {
      it('adds and returns unmined transaction', async () => {
        const tx = mintTx('tx1');
        const hash = await server.addUnminedTransaction(tx);
        expect(hash).to.equal('tx1');
        const unmined = await server.getUnminedTransactions();
        expect(unmined).to.have.lengthOf(1);
        expect(unmined[0].hash).to.equal('tx1');
      });

      it('rejects a transaction with invalid structure', async () => {
        try {
          await server.addUnminedTransaction({
            hash: 'tx1',
            metadata: { tx_type: 'mint' },
            utxoIns: [],
            utxoOuts: [],
          });
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('exactly one output');
        }
      });

      it('rejects a pour that reuses a serial number', async () => {
        await server.addUnminedTransaction(pourTx('tx-a', ['sn-1']));
        try {
          await server.addUnminedTransaction(pourTx('tx-b', ['sn-1']));
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('already in the mempool');
        }
      });

      it('rejects transaction without hash', async () => {
        try {
          const tx = mintTx('tx1');
          delete tx.hash;
          await server.addUnminedTransaction(tx);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('hash');
        }
      });
    });
  });

  describe('nullifiers', () => {
    it('stores pour serials in the mempool and leaves mints out', async () => {
      await server.addUnminedTransaction(mintTx('mint-1'));
      await server.addUnminedTransaction(pourTx('pour-1', ['sn-1', 'sn-2']));
      const unmined = await server.getUnminedNullifiers();
      expect(unmined.map((entry) => entry.sn)).to.have.members(['sn-1', 'sn-2']);
      expect(await server.getNullifiers()).to.deep.equal([]);
    });

    it('moves pour serials from the mempool set to the mined set', async () => {
      const hash = '0x' + 'ab'.repeat(32);
      const tx = pourTx(hash, ['0x' + '11'.repeat(32)]);
      await server.addUnminedTransaction(tx);
      const block = mineBlock([tx], null, server.getDifficulty());
      await server.submitBlock(block, [tx]);

      expect(await server.getUnminedNullifiers()).to.deep.equal([]);
      const mined = await server.getNullifiers();
      expect(mined).to.deep.equal([{
        sn: '0x' + '11'.repeat(32),
        txHash: hash,
        blockHeight: 0,
        txIndex: 0,
        inputIndex: 0,
      }]);
    });

    it('rejects a pour that spends an already mined serial', async () => {
      const hash = '0x' + 'cd'.repeat(32);
      const tx = pourTx(hash, ['sn-spent']);
      await server.addUnminedTransaction(tx);
      await server.submitBlock(mineBlock([tx], null, server.getDifficulty()), [tx]);
      try {
        await server.addUnminedTransaction(pourTx('tx-again', ['sn-spent']));
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('already spent');
      }
    });
  });
});
