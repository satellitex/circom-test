// script/generate_test_data.js
const { randomBytes } = require('crypto');
const { buildPoseidon } = require('circomlibjs');
const { buildEddsa } = require('circomlibjs');
const fs = require('fs');

// ランダムフィールド要素の生成（0からp-1の範囲の値）
async function randomField() {
    const p = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
    let num;
    do {
        const hex = '0x' + randomBytes(32).toString('hex');
        num = BigInt(hex);
    } while (num >= p);
    return num.toString();
}

async function generateTestData() {
    // Poseidonハッシュ関数のインスタンスを初期化
    const poseidon = await buildPoseidon();
    const eddsa = await buildEddsa();
    
    // テストデータの生成
    const testData = {
        // 消費する2つのノートのデータ
        inputs: [
            {
                amount: "1000",
                encryptedReceiver: await randomField(),
                rho: await randomField()
            },
            {
                amount: "2000",
                encryptedReceiver: await randomField(),
                rho: await randomField()
            }
        ],
        // 作成する2つの新規ノートのデータ
        outputs: [
            {
                amount: "1500",
                encryptedReceiver: await randomField(),
                rho: await randomField()
            },
            {
                amount: "1500",
                encryptedReceiver: await randomField(),
                rho: await randomField()
            }
        ],
        // その他の入力値
        merkleDepth: 20,
        smtDepth: 160,
        rho2: await randomField(),
    };

    // EdDSA用のプライベートキー生成 - 完全に確定的な値を使用
    const privateKey = Buffer.from("0001020304050607080900010203040506070809000102030405060708090001", "hex");
    const publicKey = eddsa.prv2pub(privateKey);
    
    // Nullifierの計算
    testData.nullifiers = [];
    for (let i = 0; i < testData.inputs.length; i++) {
        const input = testData.inputs[i];
        const rhoHash = poseidon.F.toString(poseidon([BigInt(input.rho)]));
        const nullifier = poseidon.F.toString(poseidon([
            BigInt(input.amount),
            BigInt(input.encryptedReceiver),
            BigInt(rhoHash)
        ]));
        testData.nullifiers.push(nullifier);
    }
    
    // ハッシュされたノート値の計算
    testData.hashedNotes = [];
    for (let i = 0; i < testData.outputs.length; i++) {
        const output = testData.outputs[i];
        const hashedNote = poseidon.F.toString(poseidon([
            BigInt(output.amount),
            BigInt(output.encryptedReceiver),
            BigInt(output.rho)
        ]));
        testData.hashedNotes.push(hashedNote);
    }
    
    // マークルツリーパスの生成（ここではデモ用に簡易的に生成）
    testData.merkleTree = {};
    for (let i = 0; i < testData.inputs.length; i++) {
        const input = testData.inputs[i];
        const leaf = poseidon.F.toString(poseidon([
            BigInt(input.amount),
            BigInt(input.encryptedReceiver),
            BigInt(input.rho)
        ]));
        
        // 簡易的なパス生成（実際には本物のマークルツリーからパスを取得する）
        const pathElements = [];
        const pathIndices = [];
        for (let j = 0; j < testData.merkleDepth; j++) {
            pathElements.push(await randomField());
            pathIndices.push(Math.random() > 0.5 ? "1" : "0");
        }
        
        testData.merkleTree[i] = {
            leaf,
            pathElements,
            pathIndices
        };
    }
    
    // SMTパスの生成（ここではデモ用に簡易的に生成）
    testData.smt = {};
    for (let i = 0; i < testData.inputs.length; i++) {
        const smtSiblings = [];
        const smtPathIndices = [];
        for (let j = 0; j < testData.smtDepth; j++) {
            smtSiblings.push(await randomField());
            smtPathIndices.push(Math.random() > 0.5 ? "1" : "0");
        }
        
        testData.smt[i] = {
            smtSiblings,
            smtPathIndices
        };
    }
    
    // 送金額合計のハッシュ
    const totalAmount = testData.inputs.reduce((sum, input) => 
        BigInt(sum) + BigInt(input.amount), BigInt(0)).toString();
    testData.hashedAmount = poseidon.F.toString(poseidon([
        BigInt(totalAmount),
        BigInt(testData.rho2)
    ]));
    
    // EdDSA署名生成
    const msgHash = eddsa.poseidon([
        BigInt(testData.inputs[0].encryptedReceiver),
        BigInt(testData.inputs[0].rho)
    ]);
    
    const signature = eddsa.signPoseidon(privateKey, msgHash);
    testData.signature = {
        R8x: eddsa.F.toString(signature.R8[0]),
        R8y: eddsa.F.toString(signature.R8[1]),
        S: signature.S.toString(),
        Ax: eddsa.F.toString(publicKey[0]),
        Ay: eddsa.F.toString(publicKey[1])
    };
    
    // ハッシュされた署名
    testData.hashedSignature = poseidon.F.toString(poseidon([
        BigInt(testData.signature.R8x),
        BigInt(testData.signature.R8y),
        BigInt(testData.signature.S)
    ]));
    
    // nddnPublicKeyの生成（実際にはkeccak-256(publicKey)[-20:]を計算する必要がある）
    // ここではデモ用に簡易的な値を設定
    testData.nddnPublicKey = await randomField();
    
    // ルート値の設定（実際には正しいマークルルートとSMTルートを計算）
    testData.rootNote = await randomField();
    testData.rootNullifier = await randomField();
    
    // JSONとして保存
    fs.writeFileSync('build/test_data.json', JSON.stringify(testData, null, 2));
    console.log('テストデータを生成し、build/test_data.jsonに保存しました');
}

generateTestData().catch(console.error);
