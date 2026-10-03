#Powers of Tau
snarkjs powersoftau new bn128 14 zksetup/pot12_0000.ptau -v
snarkjs powersoftau contribute zksetup/pot12_0000.ptau zksetup/pot12_0001.ptau --name="First contribution" -v

#Phase 2
circom zk/tester/tester.circom --r1cs --wasm --sym -o zk/tester
snarkjs groth16 setup zk/tester/tester.r1cs zk/zksetup/powersOfTau28_hez_final_14.ptau zk/tester/tester.zkey
snarkjs zkey export verificationkey zk/tester/tester.zkey zk/tester/vkey.json

circom zk/pour/pour.circom --r1cs --wasm --sym -o zk/pour
snarkjs groth16 setup zk/pour/pour.r1cs zk/zksetup/powersOfTau28_hez_final_14.ptau zk/pour/pour.zkey
snarkjs zkey export verificationkey zk/pour/pour.zkey zk/pour/vkey.json
