import { poseidon2, poseidon3 } from 'poseidon-lite';
import bs58 from 'bs58';
/* Common utilities */

// Generate a random BigInt
export function randomBigInt(){
	const hexString = Array(32)
    .fill()
    .map(() => Math.round(Math.random() * 0xF).toString(32))
    .join('');
	return BigInt(`0x${hexString}`);
}

export function bigIntToBytes(bigInt) {
  const hex = bigInt.toString(16).padStart(64, '0');
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

export function bytesToBigInt(bytes) {
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return BigInt(`0x${hex}`);
}

export function bigIntToHex(bigInt) {
  return bigInt.toString(16).padStart(64, '0');
}

export function hexToBigInt(hex) {
  return (hex !== null) ? BigInt(`0x${hex}`) : 0n;
}

export function b58ToBigInt(b58) {
  return bytesToBigInt(bs58.decode(b58));
}

export function bigIntToB58(bigInt) {
  return bs58.encode(bigIntToBytes(bigInt));
}

export function getTransactionHash(tx) {
    let input_root = 0n;
    for (let utxoIn of tx.utxoIns) {
      input_root = poseidon2([input_root, utxoIn.cm]);
    }

    let output_root = 0n;
    for (let utxoOut of tx.utxoOuts) {
      output_root = poseidon2([output_root, utxoOut.cm]);
    }

    let snarks_root = 0n;
    if ("snarks" in tx) {
      snarks_root = poseidon2([tx['snarks']['publicSignals'], tx['snarks']['proof']]);
    }

    return bigIntToHex(poseidon3([input_root, output_root, snarks_root]));
  }

export function getMerkleRoot(hashes) {
  if (hashes.length === 0) return 0n;
    if (hashes.length === 1) return hashes[0];

    let currentLevel = [...hashes];

    while (currentLevel.length > 1) {
        let nextLevel = [];

        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            // If there's no right pair, duplicate the left one
            const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : left;
            
            // Hash the pair using Poseidon
            nextLevel.push(poseidon2([left, right]));
        }

        currentLevel = nextLevel;
    }

    return currentLevel[0];
}


export function getBlockHash(block) {
    const previous = hexToBigInt(block.previous);
    const root = hexToBigInt(block.root);
    const nonce = hexToBigInt(block.nonce);

    return bigIntToHex(poseidon3([previous, root, nonce]));
  }

export function findNonce(block, difficulty) {
    const previous = hexToBigInt(block.previous);
    const root = hexToBigInt(block.root);
    let nonce = randomBigInt()
    let hash = 0n;
    do {
      nonce = nonce + 1n;
      hash = bigIntToHex(poseidon3([previous, root, nonce]));
    } while (!verifyBlockHash(hash, difficulty));
    return nonce;
  }

/* 
 * Verify the hash of a block
 * @param {BigInt} hash - The hash of the block
 * @param {number} difficulty - The difficulty of the block
 * @returns {boolean} - True if the hash is valid, false otherwise
 */
export function verifyBlockHash(hash, difficulty) {
  const hash_string = hash.toString(16).padStart(64, '0');
  for (let i = 0; i < difficulty; i++){
    if (hash_string[i] !== '0'){
      return false;
    }
  }
  return true;
}
  