# SMT Verifier Circuit

This project implements a Sparse Merkle Tree (SMT) verification circuit using Circom. The circuit verifies both inclusion and non-inclusion proofs for a Sparse Merkle Tree.

## Overview

The implementation consists of two main components:

1. **SMT Circuit (`circuits/smt.circom`)**: A Circom circuit that utilizes the `SMTVerifier` component from circomlib to verify inclusion or non-inclusion proofs.

2. **Test Data Generator (`script/gen_smt.js`)**: A JavaScript script that creates a Sparse Merkle Tree, inserts some key-value pairs, and generates both inclusion and non-inclusion proofs for testing.

## Circuit Details

The `SMTVerifierCircuit` template in `smt.circom` has the following parameters:

- `nLevels`: The height of the Sparse Merkle Tree (default is 10)

Input signals:
- `enabled`: Enable verification (1) or bypass (0)
- `root`: The Merkle tree root
- `siblings`: Array of sibling hashes for the Merkle path
- `oldKey`: For non-inclusion proof: a key that exists in tree
- `oldValue`: For non-inclusion proof: value at oldKey
- `isOld0`: Is oldKey the zero value (for zero keys)
- `key`: Key to verify (inclusion or non-inclusion)
- `value`: Value at the key location (for inclusion proof)
- `fnc`: Function: 0 = verify inclusion, 1 = verify non-inclusion

Output signals:
- `verified`: Will be 1 if verification succeeds

## How to Run

1. **Generate test data**:
   ```
   pnpm run gen-smt
   ```
   This creates test input files in the `input/` directory.

2. **Build the circuit**:
   ```
   pnpm run build-smt
   ```

3. **Setup keys, generate witness, create and verify proof**:
   ```
   pnpm run smt-process
   ```
   This runs the entire process from building the circuit to verifying the proof.

4. **Individual steps**:
   - Setup keys: `pnpm run setup-smt-keys`
   - Generate witness: `pnpm run generate-smt-witness`
   - Generate proof: `pnpm run generate-smt-proof`
   - Verify proof: `pnpm run verify-smt-proof`

## Testing Different Inputs

The default test uses an inclusion proof. To test with a non-inclusion proof, modify the `generate-smt-witness` script in `package.json` to use `non_inclusion_input.json` instead of `inclusion_input.json`.

## Implementation Details

1. The SMT implementation in `gen_smt.js` uses Poseidon hash function for both leaf and node hashing:
   - Leaf hashing: `H1 = H(key, value, 1)`
   - Node hashing: `H2 = H(left, right)`

2. The circuit verifies:
   - For inclusion: That the provided key-value pair exists at the specified path in the tree
   - For non-inclusion: That the provided key does not exist in the tree
