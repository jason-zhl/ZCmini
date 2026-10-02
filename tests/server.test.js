import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Server } from '../server/AppServer.js';
import { createDb } from '../server/db.js';
import { poseidon2 } from 'poseidon-lite';
import { bigIntToHex, getBlockHash, getMerkleRoot, hexToBigInt, verifyBlockHash } from '../common/utils.js';
import { COMMITMENT_TREE_DEPTH } from '../server/commitmentTree.js';
import { Client } from '../client/Client.js';

function mintTx(hash, cm = '0x1') {
  return {
    hash,
    utxoIns: [],
    utxoOuts: [{ cm, encrypted_secrets: {} }],
  };
}

function pourTx(hash, sns = [bigIntToHex(1n)]) {
  return {
    hash,
    utxoIns: sns,
    utxoOuts: [
      { cm: bigIntToHex(10n), encrypted_secrets: {} },
      { cm: bigIntToHex(11n), encrypted_secrets: {} },
    ],
  };
}

function rootFromProof(proof) {
  let node = hexToBigInt(proof.leaf);
  for (let i = 0; i < proof.siblings.length; i++) {
    const sibling = hexToBigInt(proof.siblings[i]);
    node = proof.pathIndices[i] === 0
      ? poseidon2([node, sibling])
      : poseidon2([sibling, node]);
  }
  return bigIntToHex(node);
}

describe('Server', () => {
  let client; 
  let server;
  let db;
  let dataDir;

  before(() => {
    client = new Client();
    dataDir = path.join(os.tmpdir(), `zcmini-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    db = createDb(dataDir);
    server = new Server({ db, blockDifficulty: 3 });
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
        const block = await client.createBlock([], server.getDifficulty(), null);
        const height = await server.submitBlock(block, []);
        expect(height).to.equal(0);
      });

      it('stores block and returns it from getBlock', async () => {
        const block = await client.createBlock([], server.getDifficulty(), null);
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
        const block = await client.createBlock([], server.getDifficulty(), null);
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
        const block = await client.createBlock([tx], server.getDifficulty(), null);
        const height = await server.submitBlock(block, [tx]);
        expect(height).to.equal(0);
      });

      it('rejects a block that does not extend the chain tip', async () => {
        const first = await client.createBlock([], server.getDifficulty(), null);
        await server.submitBlock(first, []);
        const second = await client.createBlock([], server.getDifficulty(), '0x' + 'ab'.repeat(32));
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
        const first = await client.createBlock([], server.getDifficulty(), null);
        const second = await client.createBlock([], server.getDifficulty(), first.hash);
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

  describe('pour', () => {
    let receiver;
    let pourTransaction;
    let mintedTx;
    let block;

    before(async () => {
      receiver = new Client();
      const { tx, coin } = client.createMintTransaction(100);
      mintedTx = tx;
      pourTransaction = await client.createPourTransaction(coin, 42, receiver.privateKey);
      await server.addUnminedTransaction(mintedTx);
      block = await client.createBlock([mintedTx], server.getDifficulty(), null);
      await server.submitBlock(block, [mintedTx]);
    });

    it('rejects a pour when a shape field is changed', async () => {
      const cases = [
        [(tx) => { tx.utxoIns = null; }, 'utxoIns must be an array'],
        [(tx) => { tx.utxoOuts = null; }, 'utxoOuts must be an array'],
        [(tx) => { tx.utxoIns.push('0x' + '22'.repeat(32)); }, '0 or 1'],
        [(tx) => { delete tx.hash; }, 'hash'],
        [(tx) => { tx.utxoIns[0] = '0x1'; }, 'serial number'],
        [(tx) => { tx.utxoOuts[0] = null; }, 'must be an object'],
        [(tx) => { tx.utxoOuts[0].extra = 1; }, 'encrypted_secrets'],
        [(tx) => { tx.utxoOuts[0].cm = ''; }, 'must have a cm'],
        [(tx) => { tx.utxoOuts.pop(); }, 'exactly two outputs'],
      ];

      for (const [mutate, message] of cases) {
        const tx = structuredClone(pourTransaction);
        mutate(tx);
        try {
          await server.addUnminedTransaction(tx);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include(message);
        }
      }
    });

    it('rejects a pour when serial number is already spent', async () => {
      const spent = structuredClone(pourTransaction);
      await server.addUnminedTransaction(spent);
      await server.submitBlock(
        await client.createBlock([spent], server.getDifficulty(), null),
        [spent],
      );
      const again = structuredClone(pourTransaction);
      again.hash = '0x' + 'ee'.repeat(32);
      try {
        await server.addUnminedTransaction(again);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('already spent');
      }
    });

    it('rejects a pour when serial number repeats within a transaction', async () => {
      const tx = structuredClone(pourTransaction);
      tx.utxoIns.push(tx.utxoIns[0]);
      try {
        await server.addUnminedTransaction(tx);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('is repeated');
      }
    });

    it('rejects a pour when serial number repeats within the mempool', async () => {
      await server.addUnminedTransaction(structuredClone(pourTransaction));
      const again = structuredClone(pourTransaction);
      again.hash = '0x' + 'ff'.repeat(32);
      try {
        await server.addUnminedTransaction(again);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('already in the mempool');
      }
    });

    it('accepts a pour transaction and returns height 1', async () => {
      await server.addUnminedTransaction(pourTransaction);
      const block2 = await client.createBlock([pourTransaction], server.getDifficulty(), block.hash);
      await server.submitBlock(block2, [pourTransaction]);
      const got = await server.getBlock(1);
      expect(got.hash).to.equal(block2.hash);
      expect(got.root).to.equal(block2.root);
      expect(got.nonce).to.equal(block2.nonce);
      expect(got.hash).to.equal(block2.hash);
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
            utxoIns: [],
            utxoOuts: [],
          });
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('exactly one output');
        }
      });

      it('rejects a transaction whose utxoIns length is not 0 or 1', async () => {
        const tx = pourTx('tx-len', [bigIntToHex(1n), bigIntToHex(2n)]);
        try {
          await server.addUnminedTransaction(tx);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('0 or 1');
        }
      });

      it('rejects pour inputs that are not serial numbers', async () => {
        const tx = pourTx('tx-shape');
        tx.utxoIns = [{ sn: bigIntToHex(1n) }];
        try {
          await server.addUnminedTransaction(tx);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('serial number');
        }
      });

      it('rejects outputs with fields other than cm and encrypted_secrets', async () => {
        const tx = mintTx('tx-shape');
        tx.utxoOuts = [{ cm: '0x1', encrypted_secrets: {}, value: 1 }];
        try {
          await server.addUnminedTransaction(tx);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err.message).to.include('encrypted_secrets');
        }
      });

      it('accepts a serial number given as a bigint', async () => {
        const tx = pourTx('tx-bi', [1n]);
        await server.addUnminedTransaction(tx);
        const unmined = await server.getUnminedNullifiers();
        expect(unmined.map((entry) => entry.sn)).to.deep.equal([bigIntToHex(1n)]);
      });

      it('rejects a pour that reuses a serial number', async () => {
        const sn = bigIntToHex(9n);
        await server.addUnminedTransaction(pourTx('tx-a', [sn]));
        try {
          await server.addUnminedTransaction(pourTx('tx-b', [sn]));
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

  describe('commitment tree', () => {
    it('does not include a commitment until its block is accepted', async () => {
      const cm = bigIntToHex(1n);
      await server.addUnminedTransaction(mintTx('tx1', cm));
      try {
        server.getCommitmentProof(cm);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).to.equal('NOT_FOUND');
      }
    });

    it('appends mined output commitments and returns a poseidon path', async () => {
      const cm1 = bigIntToHex(1n);
      const cm2 = bigIntToHex(2n);
      const tx1 = mintTx('0x' + '11'.repeat(32), cm1);
      const tx2 = mintTx('0x' + '22'.repeat(32), cm2);
      await server.addUnminedTransaction(tx1);
      await server.addUnminedTransaction(tx2);
      await server.submitBlock(await client.createBlock([tx1, tx2], server.getDifficulty(), null), [tx1, tx2]);

      const first = server.getCommitmentProof('0x1');
      const second = server.getCommitmentProof(cm2);
      expect(first.index).to.equal(0);
      expect(second.index).to.equal(1);
      expect(first.leaf).to.equal(cm1);
      expect(second.leaf).to.equal(cm2);
      expect(first.root).to.equal(second.root);
      expect(first.siblings).to.have.lengthOf(COMMITMENT_TREE_DEPTH);
      expect(first.pathIndices).to.have.lengthOf(COMMITMENT_TREE_DEPTH);
      expect(first.pathIndices.every((bit) => bit === 0)).to.equal(true);
      expect(second.pathIndices[0]).to.equal(1);
      expect(rootFromProof(first)).to.equal(first.root);
      expect(rootFromProof(second)).to.equal(second.root);
    });

    it('does not insert spent input commitments', async () => {
      const hash = '0x' + 'ab'.repeat(32);
      const spent = bigIntToHex(7n);
      const tx = pourTx(hash, ['0x' + '11'.repeat(32)]);
      await server.addUnminedTransaction(tx);
      await server.submitBlock(await client.createBlock([tx], server.getDifficulty(), null), [tx]);

      try {
        server.getCommitmentProof(spent);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).to.equal('NOT_FOUND');
      }
      expect(server.getCommitmentProof(bigIntToHex(10n)).index).to.equal(0);
      expect(server.getCommitmentProof(bigIntToHex(11n)).index).to.equal(1);
    });

    it('rejects a block that repeats a commitment', async () => {
      const tx1 = mintTx('0x' + '11'.repeat(32), '0x1');
      const tx2 = mintTx('0x' + '22'.repeat(32), bigIntToHex(1n));
      await server.addUnminedTransaction(tx1);
      await server.addUnminedTransaction(tx2);
      try {
        await server.submitBlock(await client.createBlock([tx1, tx2], server.getDifficulty(), null), [tx1, tx2]);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('repeated');
      }
      expect((await server.getChain()).length).to.equal(0);
    });

    it('rejects a block that reuses a commitment already in the tree', async () => {
      const cm = bigIntToHex(5n);
      const tx1 = mintTx('0x' + '11'.repeat(32), '0x5');
      await server.addUnminedTransaction(tx1);
      await server.submitBlock(await client.createBlock([tx1], server.getDifficulty(), null), [tx1]);
      const tx2 = mintTx('0x' + '22'.repeat(32), cm);
      await server.addUnminedTransaction(tx2);
      const tip = (await server.getBlock(0)).hash;
      try {
        await server.submitBlock(await client.createBlock([tx2], server.getDifficulty(), tip), [tx2]);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('already in the commitment tree');
      }
      expect((await server.getChain()).length).to.equal(1);
      expect(server.getCommitmentProof(cm).index).to.equal(0);
    });

    it('rejects an output commitment that is not hex', async () => {
      const tx = mintTx('0x' + '33'.repeat(32), 'not-a-field');
      await server.addUnminedTransaction(tx);
      try {
        await server.submitBlock(await client.createBlock([tx], server.getDifficulty(), null), [tx]);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('hex');
      }
      expect((await server.getChain()).length).to.equal(0);
    });
  });

  describe('nullifiers', () => {
    it('stores pour serials in the mempool and leaves mints out', async () => {
      await server.addUnminedTransaction(mintTx('mint-1'));
      const snA = bigIntToHex(1n);
      const snB = bigIntToHex(2n);
      await server.addUnminedTransaction(pourTx('pour-1', [snA]));
      await server.addUnminedTransaction(pourTx('pour-2', [snB]));
      const unmined = await server.getUnminedNullifiers();
      expect(unmined.map((entry) => entry.sn)).to.have.members([snA, snB]);
      expect(await server.getNullifiers()).to.deep.equal([]);
    });

    it('moves pour serials from the mempool set to the mined set', async () => {
      const hash = '0x' + 'ab'.repeat(32);
      const tx = pourTx(hash, ['0x' + '11'.repeat(32)]);
      await server.addUnminedTransaction(tx);
      const block = await client.createBlock([tx], server.getDifficulty(), null);
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
      const spentSn = bigIntToHex(8n);
      const tx = pourTx(hash, [spentSn]);
      await server.addUnminedTransaction(tx);
      await server.submitBlock(await client.createBlock([tx], server.getDifficulty(), null), [tx]);
      try {
        await server.addUnminedTransaction(pourTx('tx-again', [spentSn]));
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('already spent');
      }
    });
  });
});
