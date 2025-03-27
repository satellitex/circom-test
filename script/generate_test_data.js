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
        // 消費する2つのノートのデータ - 両方同一にする
        inputs: [
            {
                amount: "1000",
                encryptedReceiver: "100", // 簡単な値を使用
                rho: "200" // 簡単な値を使用
            },
            {
                amount: "2000",
                encryptedReceiver: "100", // 簡単な値を使用
                rho: "300" // 異なる値を使用
            }
        ],
        // 作成する2つの新規ノートのデータ - 入力と同じ値を使用
        outputs: [
            {
                amount: "1000", // 最初の入力と同じ
                encryptedReceiver: await randomField(),
                rho: await randomField()
            },
            {
                amount: "2000", // 2番目の入力と同じ
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
    
    // ノートのハッシュを計算
    const firstLeaf = poseidon.F.toString(poseidon([
        BigInt(testData.inputs[0].amount),
        BigInt(testData.inputs[0].encryptedReceiver),
        BigInt(testData.inputs[0].rho)
    ]));
    
    const secondLeaf = poseidon.F.toString(poseidon([
        BigInt(testData.inputs[1].amount),
        BigInt(testData.inputs[1].encryptedReceiver),
        BigInt(testData.inputs[1].rho)
    ]));
    
    // マークルツリーのルートを計算する（最初の2レベルだけ）
    // レベル1: ハッシュ(firstLeaf, secondLeaf)を計算
    const level1Hash = poseidon.F.toString(poseidon([
        BigInt(firstLeaf),
        BigInt(secondLeaf)
    ]));
    
    // このハッシュ値をルートノートとして設定
    testData.rootNote = level1Hash;
    
    // マークルパスを設定
    testData.merkleTree = {};
    
    // 最初のノートのマークルパス
    testData.merkleTree[0] = {
        leaf: firstLeaf,
        pathElements: [secondLeaf].concat(Array(testData.merkleDepth - 1).fill("0")),
        pathIndices: ["0"].concat(Array(testData.merkleDepth - 1).fill("0"))
    };
    
    // 2つ目のノートのマークルパス
    testData.merkleTree[1] = {
        leaf: secondLeaf,
        pathElements: [firstLeaf].concat(Array(testData.merkleDepth - 1).fill("0")),
        pathIndices: ["1"].concat(Array(testData.merkleDepth - 1).fill("0"))
    };
    
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
    
    // SMTは空のツリーを表すため、rootは0
    testData.rootNullifier = "0";
    testData.smt = {};
    
    // 各nullifierに対して、SMTにおける非包含パスを生成
    for (let i = 0; i < testData.inputs.length; i++) {
        // SMTVerifierでは非包含証明の場合、すべての兄弟ノードが0でなければならない
        const smtSiblings = Array(testData.smtDepth).fill("0");
        
        // 同様に、パスインデックスも全て0
        const smtPathIndices = Array(testData.smtDepth).fill("0");
        
        testData.smt[i] = {
            smtSiblings,
            smtPathIndices
        };
    }
    
    // 送金額合計の計算 - 文字列のまま計算するのではなくBigIntで計算
    const totalAmount = testData.inputs.reduce((sum, input) => 
        BigInt(sum) + BigInt(input.amount), BigInt(0)).toString();
    
    // 出力金額の合計も計算して確認
    const totalOutputAmount = testData.outputs.reduce((sum, output) => 
        BigInt(sum) + BigInt(output.amount), BigInt(0)).toString();
    
    // 一致しているか確認
    if (totalAmount !== totalOutputAmount) {
        console.error('入力と出力の合計金額が一致しません！', totalAmount, totalOutputAmount);
        // 一致するように調整
        testData.outputs[0].amount = testData.inputs[0].amount;
        testData.outputs[1].amount = testData.inputs[1].amount;
    }
    
    // ハッシュを計算
    testData.hashedAmount = poseidon.F.toString(poseidon([
        BigInt(totalAmount),
        BigInt(testData.rho2)
    ]));
    
    // EdDSA署名生成 - 最初の入力ノートのデータに対して署名
    // Circomでは Poseidon() 引数を直接ハッシュするが、ここでは eddsa.poseidon を使う
    const msgHash = eddsa.poseidon([
        eddsa.F.e(BigInt(testData.inputs[0].encryptedReceiver)),
        eddsa.F.e(BigInt(testData.inputs[0].rho))
    ]);
    
    const signature = eddsa.signPoseidon(privateKey, msgHash);
    testData.signature = {
        R8x: eddsa.F.toString(signature.R8[0]),
        R8y: eddsa.F.toString(signature.R8[1]),
        S: signature.S.toString(),
        Ax: eddsa.F.toString(publicKey[0]),
        Ay: eddsa.F.toString(publicKey[1])
    };
    
    // ハッシュされた署名 - Poseidonハッシュの計算
    testData.hashedSignature = poseidon.F.toString(poseidon([
        BigInt(testData.signature.R8x),
        BigInt(testData.signature.R8y),
        BigInt(testData.signature.S)
    ]));

    // デバッグログ - 重要な値を確認
    console.log("Input 1 amount:", testData.inputs[0].amount);
    console.log("Input 2 amount:", testData.inputs[1].amount);
    console.log("Output 1 amount:", testData.outputs[0].amount);
    console.log("Output 2 amount:", testData.outputs[1].amount);
    console.log("Total input amount:", totalAmount);
    console.log("Input + Output sum match:", BigInt(totalAmount) === BigInt(testData.outputs[0].amount) + BigInt(testData.outputs[1].amount));
    
    // nddnPublicKeyの生成（バイトサイズの制限に注意）
    // keccak-256(publicKey)[-20:] を想定しているので20バイト（160ビット）に制限
    const smallField = await randomField();
    const smallerValue = BigInt(smallField) % (BigInt(2) ** BigInt(160));
    testData.nddnPublicKey = smallerValue.toString();
    
    // 出力ディレクトリを確認して作成
    if (!fs.existsSync('build')) {
        fs.mkdirSync('build');
    }
    
    // JSONとして保存
    fs.writeFileSync('build/test_data.json', JSON.stringify(testData, null, 2));
    console.log('テストデータを生成し、build/test_data.jsonに保存しました');
}

generateTestData().catch(console.error);
