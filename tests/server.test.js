import { expect } from 'chai';
import path from 'path';
import os from 'os';
import { Server } from '../server/AppServer.js';

describe('Server', () => {
  let server;
  let dataDir;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `zcmini-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    server = new Server({ dataDir, blockDifficulty: 3 });
  });

  describe('getDifficulty', () => {
    it('returns configured block difficulty', () => {
      expect(server.getDifficulty()).to.equal(3);
    });
  });

  describe('submitBlock', () => {
    it('accepts a valid block and returns height 0', async () => {
      const block = { hash: '0x1', previous: null, root: '0x2', nonce: '0' };
      const height = await server.submitBlock(block, []);
      expect(height).to.equal(0);
    });

    it('stores block and returns it from getBlock', async () => {
      const block = { hash: '0x1', previous: null, root: '0x2', nonce: '0' };
      await server.submitBlock(block, []);
      const got = await server.getBlock(0);
      expect(got).to.include({ height: 0, hash: '0x1' });
    });

    it('rejects when block is missing', async () => {
      try {
        await server.submitBlock(null, []);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('block');
      }
    });
  });

  describe('getChain', () => {
    it('returns empty chain when no blocks', async () => {
      const chain = await server.getChain();
      expect(chain).to.deep.equal({ length: 0, blocks: [] });
    });

    it('returns blocks after submitBlock', async () => {
      await server.submitBlock({ hash: 'a', previous: null, root: 'r', nonce: '0' }, []);
      await server.submitBlock({ hash: 'b', previous: 'a', root: 'r', nonce: '0' }, []);
      const { length, blocks } = await server.getChain();
      expect(length).to.equal(2);
      expect(blocks).to.have.lengthOf(2);
      expect(blocks[0].hash).to.equal('a');
      expect(blocks[1].hash).to.equal('b');
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

  describe('addUnminedTransaction / getUnminedTransactions', () => {
    it('adds and returns unmined transaction', async () => {
      const tx = { hash: 'tx1', metadata: { tx_type: 'mint' }, utxoIns: [], utxoOuts: [] };
      const hash = await server.addUnminedTransaction(tx);
      expect(hash).to.equal('tx1');
      const unmined = await server.getUnminedTransactions();
      expect(unmined).to.have.lengthOf(1);
      expect(unmined[0].hash).to.equal('tx1');
    });

    it('rejects transaction without hash', async () => {
      try {
        await server.addUnminedTransaction({ metadata: {} });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('hash');
      }
    });
  });
});
