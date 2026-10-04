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

const HEX_STRING = /^0x[0-9a-fA-F]+$/;

function mapJson(value, convert) {
  const converted = convert(value);
  if (converted !== undefined) return converted;
  if (Array.isArray(value)) return value.map((item) => mapJson(item, convert));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([field, fieldValue]) => [field, mapJson(fieldValue, convert)])
    );
  }
  return value;
}

/** Copy a JSON value, converting every bigint to a 0x hex string at any depth. */
export function bigIntsToHex(value) {
  return mapJson(value, (item) => (typeof item === 'bigint' ? bigIntToHex(item) : undefined));
}

/** Inverse of bigIntsToHex: copy a JSON value, converting every 0x hex string back to bigint. */
export function hexToBigInts(value) {
  return mapJson(value, (item) => (
    typeof item === 'string' && HEX_STRING.test(item) ? hexToBigInt(item) : undefined
  ));
}

export function getTransactionHash(tx) {
    if (tx.hash) return tx.hash;
    let input_root = 0n;
    for (let utxoIn of tx.utxoIns) {
      const sn = typeof utxoIn === 'bigint' ? utxoIn : hexToBigInt(utxoIn);
      input_root = poseidon2([input_root, sn]);
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

export function pourSerials(tx) {
  if (!Array.isArray(tx?.utxoIns)) {
    throw new Error('utxoIns must be an array');
  }
  if (tx.utxoIns.length === 0) return [];
  const serials = [];
  for (let inputIndex = 0; inputIndex < tx.utxoIns.length; inputIndex++) {
    const raw = tx.utxoIns[inputIndex];
    const sn = typeof raw === 'bigint' ? (raw < 0n ? null : bigIntToHex(raw)) : raw;
    if (sn == null || sn === '') continue;
    serials.push({ sn, inputIndex });
  }
  return serials;
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
  