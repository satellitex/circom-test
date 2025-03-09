
// script/prepare_input.js
const fs = require('fs');

function prepareInputs() {
    // テストデータを読み込む
    const testData = JSON.parse(fs.readFileSync('build/test_data.json', 'utf8'));
    
    // Circomの入力形式に変換
    const input = {
        // 公開入力
        rootNullifier: testData.rootNullifier,
        rootNote: testData.rootNote,
        hashedSignature: testData.hashedSignature,
        Nullifier: testData.nullifiers,
        hashedOnetimeNote_out: testData.hashedNotes,
        hashedAmount: testData.hashedAmount,
        
        // 秘密入力
        amount_in: testData.inputs.map(i => i.amount),
        encryptedReceiver_in: testData.inputs.map(i => i.encryptedReceiver),
        rho_in: testData.inputs.map(i => i.rho),
        
        note_pathElements: Object.values(testData.merkleTree).map(tree => tree.pathElements),
        note_pathIndex: Object.values(testData.merkleTree).map(tree => tree.pathIndices),
        smt_siblings: Object.values(testData.smt).map(smt => smt.smtSiblings),
        smt_pathIndices: Object.values(testData.smt).map(smt => smt.smtPathIndices),
        
        amount_out: testData.outputs.map(o => o.amount),
        encryptedReceiver_out: testData.outputs.map(o => o.encryptedReceiver),
        rho_out: testData.outputs.map(o => o.rho),
        
        // 署名データ
        Ax: testData.signature.Ax,
        Ay: testData.signature.Ay,
        R8x: testData.signature.R8x,
        R8y: testData.signature.R8y,
        S: testData.signature.S,
        
        // その他
        nddnPublicKey: testData.nddnPublicKey,
        rho2: testData.rho2
    };
    
    // 入力ファイルを保存
    fs.writeFileSync('build/onetime_note_js/input.json', JSON.stringify(input, null, 2));
    console.log('Circom入力ファイルを生成しました: build/onetime_note_js/input.json');
}

prepareInputs();