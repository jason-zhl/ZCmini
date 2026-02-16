import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';
import * as snarkjs from 'snarkjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const circuit_name = 'tester';
const WCBuilder = require(path.join(__dirname, `../zk/${circuit_name}/${circuit_name}_js/witness_calculator.js`));
const wasmBuffer = readFileSync(path.join(__dirname, `../zk/${circuit_name}/${circuit_name}_js/${circuit_name}.wasm`));
const WC = await WCBuilder(wasmBuffer);

const ZKEY = readFileSync(path.join(__dirname, `../zk/${circuit_name}/${circuit_name}.zkey`));
const VKEY = JSON.parse(readFileSync(path.join(__dirname, `../zk/${circuit_name}/vkey.json`), 'utf-8'));

export async function buildProof(input) {
  try {
    const witness = await WC.calculateWTNSBin(input, 0);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, witness);
    return { proof, publicSignals };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`buildProof failed: ${message}`, { cause: err });
  }
}

export async function verifyProof(publicSignals, proof) {
  const isValid = await snarkjs.groth16.verify(VKEY, publicSignals, proof);
  return isValid;
}
