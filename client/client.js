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
    
    const {tx : tx1, coin : coin1} = this.createMintTransaction(100);
    await this.api.submitTransaction(tx1);
    await this.mineAndSendAllUnminedTransactions();

    const merkleProof = await this.api.getCommitmentProof(utils.bigIntToHex(coin1.cm));
    console.dir(merkleProof, { depth: null });

    try {
      const { proof, publicSignals } = await zk.buildProof(pour_input);
      const isValid = await zk.verifyProof(publicSignals, proof);
      console.log('Proof is valid:', isValid);
      console.log('Public signals:', publicSignals);
      console.log('True CM:', coin1.cm);
      console.log('True SN:', coin1.sn);
    } catch (err) {
      console.error('buildProof error:', err instanceof Error ? err.message : String(err));
      throw err;
    }

    // const {tx : tx1, coin : coin1} = this.createMintTransaction(100);
    // const {tx : tx2, coin : coin2} = this.createMintTransaction(200);

    // await this.api.submitTransaction(tx1);
    // await this.api.submitTransaction(tx2);

    // await this.mineAndSendAllUnminedTransactions();

    // const {tx : tx3, coin : coin3} = this.createMintTransaction(300);
    // await this.api.submitTransaction(tx3);

    // await this.minAndSendAllUnminedTransactions();
    // const chain = await this.api.getChain();
    // console.log('returned chain:');
    // console.dir(chain, { depth: null });
  }

  createCoin(value) {
    const valueField = BigInt(value);
    // sn := Poseidon(a_{sk}, rho)
    const keySalt = utils.randomBigInt();
    const sn = poseidon2([this.privateKey, keySalt]);

    // keyCm = h( keyCmSalt || a_{pk} || rho)
    const keyCmSalt = utils.randomBigInt();
    const keyCm = poseidon3([keyCmSalt, this.transmissionKey, keySalt]);

    // cm = h( cmSalt || v || keyCm )
    const cmSalt = utils.randomBigInt();
    const cm = poseidon3([cmSalt, valueField, keyCm]);
    const coin = {
      apk: this.transmissionKey,
      key_salt: keySalt,
      key_cm_salt: keyCmSalt,
      cm_salt: cmSalt,
      sn,
      key_cm: keyCm,
      cm,
      value: valueField,
    };
    return { coin };
  }

  createMintTransaction(value) {
    const { coin } = this.createCoin(value);
    const published = Object.fromEntries(Object.entries(coin).map(([field, fieldValue]) => [field, utils.bigIntToHex(fieldValue)]));
    // TODO: replace owner identification with encryption (BabyJubJub)
    const mint_tx = { cm : published.cm, encrypted_secrets : published };
    const tx = { 
      hash: null,
      utxoIns: [],
      utxoOuts: [ mint_tx ],
    };
    tx.hash = utils.getTransactionHash(tx);
    return { tx, coin };
  }

  async createPourTransaction(inputCoin, send_value, recipientKey) {
    const sendValue = BigInt(send_value);
    if (inputCoin.value < sendValue) {
      throw new Error('Insufficient funds');
    }
    const changeValue = inputCoin.value - sendValue;
    const { coin: send_coin } = this.createCoin(sendValue);
    const { coin: change_coin } = this.createCoin(changeValue);

    const pour_input = { 
      ask: this.privateKey, 
      inputNotes: [ [ coin1.key_salt, coin1.key_cm_salt, coin1.cm_salt, coin1.value ] ],
      merkleRoot: merkleProof.root,
      merkleSiblings: [ merkleProof.siblings ],
      merklePathIndices: [ merkleProof.pathIndices ],
      rpk: recipientKey,
      outputNotes: [ 
        [ change_coin.key_salt, change_coin.key_cm_salt, change_coin.cm_salt, change_coin.value ], 
        [ send_coin.key_salt, send_coin.key_cm_salt, send_coin.cm_salt, send_coin.value ] 
      ],
    };

    let proof, publicSignals;
    try {
      const result = await zk.buildProof(pour_input);
      proof = result.proof;
      publicSignals = result.publicSignals;
    } catch (err) {
      console.error('buildProof error:', err instanceof Error ? err.message : String(err));
      throw err;
    }

    const publishedSend = Object.fromEntries(Object.entries(send_coin).map(([field, fieldValue]) => [field, utils.bigIntToHex(fieldValue)]));
    const publishedChange = Object.fromEntries(Object.entries(change_coin).map(([field, fieldValue]) => [field, utils.bigIntToHex(fieldValue)]));
    const tx = {
      utxoIns: [inputCoin.sn],
      utxoOuts: [
        { cm: publishedSend.cm, encrypted_secrets: publishedSend },
        { cm: publishedChange.cm, encrypted_secrets: publishedChange },
      ],
      proof,
      publicSignals,
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

  async mineAndSendAllUnminedTransactions() {
    const unmined = await this.api.getUnminedTransactions();
    const difficulty = Number(await this.api.getBlockDifficulty());
    const lastBlock = await this.api.getLatestBlocks(1);
    const previousHash = lastBlock.length === 0 ? null : lastBlock[0].hash;
    const mined_block = await this.createBlock(unmined, difficulty, previousHash);
    const result = await this.api.sendMinedBlock(mined_block, unmined);
    console.log('sendMinedBlock result:', result, 'height:', result?.height);
  }
}
