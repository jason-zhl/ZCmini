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

    const { coin } = this.createCoin(100);
    const { sn, tx } = this.createMintTransaction(coin);
    console.log(tx);
    console.log(coin);

    const block = this.createBlock([tx]);
    console.log("block (unmined):", block);
    console.log("block hash (unmined):", utils.getBlockHash(block));

    const minedBlock = await this.mine(block);
    console.log("block (mined):", minedBlock);
    console.log("block hash (mined):", utils.getBlockHash(minedBlock));
  }

  createCoin(value) {
    // sn := Poseidon(a_{sk}, rho)
    const key_salt = utils.randomBigInt();
    const sn = poseidon2([this.privateKey, key_salt]);

    // k = com_r (a_{pk} || rho)
    const key_cm_salt = utils.randomBigInt();
    const key_cm = poseidon3([this.transmissionKey, key_cm_salt, key_cm_salt]);
    
    // cm = com_r (v || a_{pk} || s)
    const cm_salt = utils.randomBigInt();
    const cm = poseidon3([value, this.transmissionKey, cm_salt]);
    const coin = { apk : this.transmissionKey, value, key_salt, key_cm_salt, cm_salt, sn, key_cm, cm };
    return { coin };
  }

  createMintTransaction(coin) {
    const sn = coin.sn;
    const encrypted_secrets = { key_salt : coin.key_salt, key_cm_salt : coin.key_cm_salt };
    const mint_tx = { value: coin.value, key_cm : coin.key_cm, cm_salt : coin.cm_salt, cm : coin.cm, encrypted_secrets };
    const tx = { 
      metadata: { 
        tx_type : 'mint'
      },
      hash: null,
      utxoIns: [],
      utxoOuts: [ mint_tx ],
    };
    tx.hash = utils.getTransactionHash(tx);
    return { sn, tx };
  }

  async createPourTransaction(inputCoin, merkleProof, send_value, recipientKey) {
    if (inputCoin.value < send_value) {
      throw new Error('Insufficient funds');
    }
    const change_value = inputCoin.value - send_value;
    const { coin: send_coin } = this.createCoin(send_value);
    const { coin: change_coin } = this.createCoin(change_value);

    const oldSn = poseidon2([send_coin.key_salt, this.privateKey]);
    let proof, publicSignals;
    try {
      const result = await zk.buildProof({
        privateKey: this.privateKey,
        inputCoin,
        c1,
        c2,
        merkleProof,
      });
      proof = result.proof;
      publicSignals = result.publicSignals;
    } catch (err) {
      console.error('buildProof error:', err instanceof Error ? err.message : String(err));
      throw err;
    }
    const tx = {
      metadata: { 
        tx_type : 'pour'
      },
      utxoIns: [{ cm: inputCoin.cm, sn: oldSn }],
      utxoOuts: [{ cm: c1.cm }, { cm: c2.cm }],
      proof,
      publicSignals,
    };
    return { tx, c1, c2 };
  }

  createBlock(transactions) {
    const block = {
      hash: null,
      previous: null,
      root: utils.getMerkleRoot(transactions.map(tx => utils.getTransactionHash(tx))),
      nonce: null,
    };

    block.hash = utils.getBlockHash(block);
    return block;
  }
  async mine(block) {
    // const blockDifficulty = await this.api.getBlockDifficulty(); TODO: Implement difficulty
    const blockDifficulty = 3;
    const nonce = utils.findNonce(block, blockDifficulty);
    block.nonce = utils.bigIntToHex(nonce);
    block.hash = utils.getBlockHash(block);
    return block;
  }
}
