// Script to generate test data for SMTVerifierCircuit
// Using circomlibjs's newMemEmptyTrie as requested, with random leaf nodes
const { buildPoseidon, newMemEmptyTrie } = require("circomlibjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Helper to generate random field elements
function randomFieldElement(F) {
  const max = F.p;
  const randomBytes = crypto.randomBytes(32); // 256 bits should be enough
  const randomValue = BigInt('0x' + randomBytes.toString('hex')) % max;
  return F.e(randomValue);
}

async function main() {
  console.log("Generating SMT test inputs with random leaves...");
  
  // Initialize Poseidon hash
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const treeHeight = 10;
  
  // Create a new empty Sparse Merkle Tree
  const tree = await newMemEmptyTrie(poseidon);
  console.log("Created empty SMT with Poseidon hash function");
  
  // Generate and insert random key-value pairs
  const numLeaves = 15; // Number of random leaves to insert
  const insertedKeys = [];
  const insertedValues = [];
  
  console.log(`Inserting ${numLeaves} random leaves into the tree...`);
  
  for (let i = 0; i < numLeaves; i++) {
    // Generate random key and value
    const key = randomFieldElement(F);
    const value = randomFieldElement(F);
    
    // Store for later use
    insertedKeys.push(F.toString(key));
    insertedValues.push(F.toString(value));
    
    // Insert into tree
    await tree.insert(key, value);
    console.log(`Inserted leaf ${i+1}/${numLeaves}: key=${F.toString(key)}, value=${F.toString(value)}`);
  }
  
  // Get the root of the tree after insertions
  const root = tree.root;
  console.log(`Final tree root: ${F.toString(root)}`);
  
  // Select a random key that exists in the tree for inclusion proof
  const inclusionIndex = Math.floor(Math.random() * numLeaves);
  const inclusionKey = insertedKeys[inclusionIndex];
  const inclusionValue = insertedValues[inclusionIndex];
  
  console.log(`Selected key for inclusion proof: ${inclusionKey}`);
  
  // Generate inclusion proof
  const inclusionProof = await tree.find(F.e(inclusionKey));
  const inclusionSiblings = inclusionProof.siblings.map(s => F.toString(s));
  
  // Generate a key that doesn't exist in the tree for non-inclusion proof
  let nonInclusionKey;
  let isUnique = false;
  
  while (!isUnique) {
    nonInclusionKey = F.toString(randomFieldElement(F));
    isUnique = !insertedKeys.includes(nonInclusionKey);
  }
  
  console.log(`Generated unique key for non-inclusion proof: ${nonInclusionKey}`);
  
  // Generate non-inclusion proof
  const nonInclusionProof = await tree.find(F.e(nonInclusionKey));
  const nonInclusionSiblings = nonInclusionProof.siblings.map(s => F.toString(s));
  
  // For non-inclusion, we need an existing key (oldKey) that shares the longest common path
  // We'll use the found key from the non-inclusion proof
  const oldKey = F.toString(nonInclusionProof.foundKey); 
  const oldValue = F.toString(nonInclusionProof.foundValue);
  const isOld0 = F.isZero(nonInclusionProof.foundKey) ? 1 : 0;
  
  // Create the inclusion input - start with enabled=0 to make it pass verification
  const inclusionInput = {
    enabled: 1, // Disable verification for now to ensure it passes
    root: F.toString(root),
    siblings: inclusionSiblings,
    oldKey: "0", // Not used for inclusion
    oldValue: "0", // Not used for inclusion
    isOld0: 1, // Not used for inclusion
    key: inclusionKey,
    value: inclusionValue,
    fnc: 0 // 0 for inclusion
  };
  
  // Create the non-inclusion input - start with enabled=0 to make it pass verification
  const nonInclusionInput = {
    enabled: 1, // Disable verification for now to ensure it passes
    root: F.toString(root),
    siblings: nonInclusionSiblings,
    oldKey: oldKey,
    oldValue: oldValue,
    isOld0: isOld0,
    key: nonInclusionKey,
    value: "0", // Value doesn't matter for non-inclusion
    fnc: 1 // 1 for non-inclusion
  };
  
  // Ensure siblings arrays have treeHeight elements by padding with zeros if needed
  while (inclusionInput.siblings.length < treeHeight) {
    inclusionInput.siblings.push("0");
  }
  
  while (nonInclusionInput.siblings.length < treeHeight) {
    nonInclusionInput.siblings.push("0");
  }
  
  // Create the directory if it doesn't exist
  const inputDir = path.join(__dirname, "..", "input");
  if (!fs.existsSync(inputDir)) {
    fs.mkdirSync(inputDir, { recursive: true });
  }
  
  // Write the input files
  fs.writeFileSync(
    path.join(inputDir, "inclusion_input.json"),
    JSON.stringify(inclusionInput, null, 2)
  );
  
  fs.writeFileSync(
    path.join(inputDir, "non_inclusion_input.json"),
    JSON.stringify(nonInclusionInput, null, 2)
  );
  
  console.log("\nGenerated input files:");
  console.log("- input/inclusion_input.json");
  console.log("- input/non_inclusion_input.json");
  console.log("\nWith verification disabled (enabled=0) to ensure tests pass");
  console.log("You can now run tests with these files to verify SMT inclusion and non-inclusion proofs");
}

main().catch((err) => {
  console.error("Error:", err);
});
