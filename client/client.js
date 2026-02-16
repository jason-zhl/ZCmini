import { generateMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { poseidon1, poseidon2, poseidon3 } from 'poseidon-lite';
import * as utils from '../common/utils.js';
import * as zk from './zk.js';

function createShieldedCoin(value, publicKey) {
  const rho = utils.randomBigInt();
  const apk = publicKey;
  const cm = poseidon3([apk, value, rho]);
  const coin = { apk, value, rho, cm };
  return { coin };
}

function mnemonicToBigInt(mnemonic) {
  const entropyBytes = mnemonicToEntropy(mnemonic, wordlist);
  const hexString = Array.from(entropyBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return BigInt(`0x${hexString}`);
}

export class Client {
  constructor() {
    this.mnemonic = generateMnemonic(wordlist);
    this.privateKey = mnemonicToBigInt(this.mnemonic);
    this.transmissionKey = poseidon1([this.privateKey]);
  }

  async test() {
    console.log('Running Client Test');

    const tester_input = { privateKey: this.privateKey };
    try {
      const { proof, publicSignals } = await zk.buildProof(tester_input);
      const isValid = await zk.verifyProof(publicSignals, proof);
      console.log('Proof is valid:', isValid);
      console.log('Public signals:', publicSignals);
      console.log('My public key:', this.transmissionKey);
    } catch (err) {
      console.error('buildProof error:', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async createMintTransaction(value) {
    const { coin } = createShieldedCoin(value, this.transmissionKey);
    const tx = {
      utxoIns: [],
      utxoOuts: [{ cm: coin.cm }],
    };
    return { coin, tx };
  }

  async createPourTransaction(inputCoin, merkleProof, value, change, recipientKey) {
    const { coin: c1 } = createShieldedCoin(value, recipientKey);
    const { coin: c2 } = createShieldedCoin(change, this.transmissionKey);

    const oldSn = poseidon2([inputCoin.rho, this.privateKey]);
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
      utxoIns: [{ cm: inputCoin.cm, sn: oldSn }],
      utxoOuts: [{ cm: c1.cm }, { cm: c2.cm }],
      proof,
      publicSignals,
    };
    return { tx, c1, c2 };
  }
}
