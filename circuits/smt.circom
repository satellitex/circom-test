pragma circom 2.0.0;

include "node_modules/circomlib/circuits/smt/smtverifier.circom";

// A simplified circuit that only verifies inclusion or exclusion in a Sparse Merkle Tree
template SMTVerifierCircuit(nLevels) {
    // Input signals
    signal input enabled;              // Enable verification (1) or bypass (0)
    signal input root;                 // The Merkle tree root
    signal input siblings[nLevels];    // Array of sibling hashes for the Merkle path
    signal input oldKey;               // For non-inclusion proof: a key that exists in tree
    signal input oldValue;             // For non-inclusion proof: value at oldKey
    signal input isOld0;               // Is oldKey the zero value (for zero keys)
    signal input key;                  // Key to verify (inclusion or non-inclusion)
    signal input value;                // Value at the key location (for inclusion proof)
    signal input fnc;                  // Function: 0 = verify inclusion, 1 = verify non-inclusion

    // Output signals
    signal output verified;            // Will be 1 if verification succeeds

    // Create an instance of SMTVerifier
    component verifier = SMTVerifier(nLevels);
    
    // Connect all inputs
    verifier.enabled <== enabled;
    verifier.root <== root;
    for (var i = 0; i < nLevels; i++) {
        verifier.siblings[i] <== siblings[i];
    }
    verifier.oldKey <== oldKey;
    verifier.oldValue <== oldValue;
    verifier.isOld0 <== isOld0;
    verifier.key <== key;
    verifier.value <== value;
    verifier.fnc <== fnc;
    
    // If we get here, verification succeeded
    // (SMTVerifier throws errors via constraints if verification fails)
    verified <== enabled;
}

// Main component with a depth of 10 (adjust as needed)
component main {public [root, key, value, fnc]} = SMTVerifierCircuit(10);
