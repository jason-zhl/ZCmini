import { generateMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { poseidon1, poseidon2, poseidon3 } from 'poseidon-lite';
import * as utils from '../common/utils.js';
import * as zk from './zk.js';
import { ServerAPI } from './api.js';

function mnemonicToBigInt(mnemonic) {
  const entropyBytes = mnemonicToEntropy(mnemonic, wordlist);
  const hexString = Array.from(entropyBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return BigInt(`0x${hexString}`);
}

export class Client {
  constructor(options = {}) {
    this.mnemonic = generateMnemonic(wordlist);
    this.privateKey = mnemonicToBigInt(this.mnemonic);
    this.transmissionKey = poseidon1([this.privateKey]);
    this.api = new ServerAPI();
  }

  async test() {
    console.log('Running Client Test');

    // const tester_input = { privateKey: this.privateKey };
    // try {
    //   const { proof, publicSignals } = await zk.buildProof(tester_input);
    //   const isValid = await zk.verifyProof(publicSignals, proof);
    //   console.log('Proof is valid:', isValid);
    //   console.log('Public signals:', publicSignals);
    //   console.log('My public key:', this.transmissionKey);
    // } catch (err) {
    //   console.error('buildProof error:', err instanceof Error ? err.message : String(err));
    //   throw err;
    // }

    const {tx : tx1, coin : coin1} = this.createMintTransaction(100);
    const {tx : tx2, coin : coin2} = this.createMintTransaction(200);

    await this.api.submitTransaction(tx1);
    await this.api.submitTransaction(tx2);

    await this.minAndSendAllUnminedTransactions();

    const {tx : tx3, coin : coin3} = this.createMintTransaction(300);
    await this.api.submitTransaction(tx3);

    await this.minAndSendAllUnminedTransactions();
    const chain = await this.api.getChain();
    console.log('returned chain:');
    console.dir(chain, { depth: null });
  }

  createCoin(value) {
    const valueField = BigInt(value);
    // sn := Poseidon(a_{sk}, rho)
    const keySalt = utils.randomBigInt();
    const sn = poseidon2([this.privateKey, keySalt]);

    // k = com_r (a_{pk} || rho)
    const keyCmSalt = utils.randomBigInt();
    const keyCm = poseidon3([this.transmissionKey, keyCmSalt, keyCmSalt]);

    // cm = com_r (v || a_{pk} || s)
    const cmSalt = utils.randomBigInt();
    const cm = poseidon3([valueField, this.transmissionKey, cmSalt]);
    const coin = Object.fromEntries(Object.entries({
      apk: this.transmissionKey,
      key_salt: keySalt,
      key_cm_salt: keyCmSalt,
      cm_salt: cmSalt,
      sn,
      key_cm: keyCm,
      cm,
    }).map(([field, fieldValue]) => [field, utils.bigIntToHex(fieldValue)]));
    coin.value = value;
    return { coin };
  }

  createMintTransaction(value) {
    const { coin } = this.createCoin(value);
    // TODO: replace owner identification with encryption (BabyJubJub)
    const mint_tx = { cm : coin.cm, encrypted_secrets : coin };
    const tx = { 
      hash: null,
      utxoIns: [],
      utxoOuts: [ mint_tx ],
    };
    tx.hash = utils.getTransactionHash(tx);
    return { tx, coin };
  }

  async createPourTransaction(inputCoin, send_value, recipientKey) {
    if (inputCoin.value < send_value) {
      throw new Error('Insufficient funds');
    }
    const change_value = inputCoin.value - send_value;
    const { coin: send_coin } = this.createCoin(send_value);
    const { coin: change_coin } = this.createCoin(change_value);

    // let proof, publicSignals;
    // try {
    //   const result = await zk.buildProof({
    //     privateKey: this.privateKey,
    //     inputCoin,
    //     c1,
    //     c2,
    //     merkleProof,
    //   });
    //   proof = result.proof;
    //   publicSignals = result.publicSignals;
    // } catch (err) {
    //   console.error('buildProof error:', err instanceof Error ? err.message : String(err));
    //   throw err;
    // }

    const tx = {
      utxoIns: [inputCoin.sn],
      utxoOuts: [
        { cm: send_coin.cm, encrypted_secrets: send_coin },
        { cm: change_coin.cm, encrypted_secrets: change_coin },
      ],
      // proof,
      // publicSignals,
    };
    tx.hash = utils.getTransactionHash(tx);
    return tx;
  }

  async createBlock(transactions, difficulty, previousHash) {
    const block = {
      hash: null,
      previous: previousHash,
      root: utils.getMerkleRoot(transactions.map(tx => utils.getTransactionHash(tx))),
      nonce: '0x0',
    };
    block.nonce = utils.findNonce(block, difficulty);
    block.hash = utils.getBlockHash(block);
    return block;
  }

  async minAndSendAllUnminedTransactions() {
    const unmined = await this.api.getUnminedTransactions();
    const difficulty = Number(await this.api.getBlockDifficulty());
    const lastBlock = await this.api.getLatestBlocks(1);
    const previousHash = lastBlock.length === 0 ? null : lastBlock[0].hash;
    const mined_block = await this.createBlock(unmined, difficulty, previousHash);
    const result = await this.api.sendMinedBlock(mined_block, unmined);
    console.log('sendMinedBlock result:', result, 'height:', result?.height);
  }
}
