import { poseidon2, poseidon3 } from 'poseidon-lite';
/* Common utilities */

// Generate a random BigInt
export function randomBigInt(){
	const hexString = Array(32)
    .fill()
    .map(() => Math.round(Math.random() * 0xF).toString(32))
    .join('');
	return BigInt(`0x${hexString}`);
}

export function bigIntToHex(bigInt) {
  return '0x' + bigInt.toString(16).padStart(64, '0');
}

export function hexToBigInt(hex) {
  return (hex !== null) ? BigInt(hex) : 0n;
}

export function getTransactionHash(tx) {
    if (tx.hash) return tx.hash;
    let input_root = 0n;
    for (let utxoIn of tx.utxoIns) {
      input_root = poseidon2([input_root, hexToBigInt(utxoIn.cm)]);
    }

    let output_root = 0n;
    for (let utxoOut of tx.utxoOuts) {
      output_root = poseidon2([output_root, hexToBigInt(utxoOut.cm)]);
    }

    let snarks_root = 0n;
    if ("snarks" in tx) {
      snarks_root = poseidon2([tx['snarks']['publicSignals'], tx['snarks']['proof']]);
    }

    return bigIntToHex(poseidon3([input_root, output_root, snarks_root]));
  }

export function getMerkleRoot(hashes) {
  if (hashes.length === 0) return bigIntToHex(0n);
  if (hashes.length === 1) return hashes[0];

  let currentLevel = hashes.map((hash) => hexToBigInt(hash));

  while (currentLevel.length > 1) {
    const nextLevel = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : left;
      nextLevel.push(poseidon2([left, right]));
    }

    currentLevel = nextLevel;
  }

  return bigIntToHex(currentLevel[0]);
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
    return bigIntToHex(nonce);
  }

/*
 * Verify the hash of a block.
 * @param {string} hash - Block hash as a 0x hex string
 * @param {number} difficulty - The difficulty of the block
 * @returns {boolean} - True if the hash is valid, false otherwise
 */
export function verifyBlockHash(hash, difficulty) {
  const hash_string = hash.toString(16).padStart(64, '0');
  for (let i = 2; i < difficulty + 2; i++){
    if (hash_string[i] !== '0'){
      return false;
    }
  }
  return true;
}
  