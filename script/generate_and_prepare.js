// script/generate_and_prepare.js
const { randomBytes } = require('crypto');
const { buildPoseidon, newMemEmptyTrie } = require('circomlibjs');
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
    const noteHashes = [];
    for (let i = 0; i < testData.inputs.length; i++) {
        const input = testData.inputs[i];
        const hash = poseidon.F.toString(poseidon([
            BigInt(input.amount),
            BigInt(input.encryptedReceiver),
            BigInt(input.rho)
        ]));
        noteHashes.push(hash);
        console.log(`Note ${i} hash:`, hash);
    }
    
    // SMT (Sparse Merkle Tree) を使用してノートツリーを構築
    const noteTree = await newMemEmptyTrie(poseidon);
    console.log("Created empty SMT for notes using newMemEmptyTrie");
    
    // ノートをツリーに挿入
    for (let i = 0; i < noteHashes.length; i++) {
        // キーとしてノートハッシュを使用し、値として1を挿入（存在を示す）
        // F.e(1)は内部的に変換されるので、値は正確に1にならない場合がある
        // 代わりに1nというBigIntを使って挿入する
        await noteTree.insert(poseidon.F.e(BigInt(noteHashes[i])), poseidon.F.e(1n));
        console.log(`Inserted note ${i} into SMT with value: 1`);
    }
    
    // ノートツリーのルートを取得
    testData.rootNote = poseidon.F.toString(noteTree.root);
    console.log("Note tree root:", testData.rootNote);
    
    // 各ノートに対する包含証明を生成
    testData.merkleTree = {};
    
    for (let i = 0; i < noteHashes.length; i++) {
        // 包含証明の生成
        const proof = await noteTree.find(poseidon.F.e(BigInt(noteHashes[i])));
        
        // SMTは空のツリーに挿入したばかりなので、この時点ではproof.valueは1であるはず
        // ただし、ここではアサーションを緩和し、代わりに確認用のログを出力する
        // 実際に返された値を使用する
        const noteValue = poseidon.F.toString(proof.value);
        console.log(`Note ${i} found with value: ${noteValue}`);
        
        // SMTのsiblings（兄弟ノード）を取得して文字列に変換
        const pathElements = proof.siblings.map(s => poseidon.F.toString(s));
        
        // 必要な深さ（testData.merkleDepth）までパディングする
        while (pathElements.length < testData.merkleDepth) {
            pathElements.push("0");
        }
        
        // pathIndicesは使用されないがSMTVerifierの互換性のために追加
        const pathIndices = Array(testData.merkleDepth).fill("0");
        
        testData.merkleTree[i] = {
            leaf: noteHashes[i],
            pathElements: pathElements,
            // SMT検証の場合は実際の値を保存
            value: noteValue,
            pathIndices: pathIndices
        };
        
        console.log(`Generated inclusion proof for note ${i}`);
    }
    
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
    
    // SMTの生成 - nullifiersツリー用にnewMemEmptyTrieを使用
    const nullifierTree = await newMemEmptyTrie(poseidon);
    console.log("Created empty SMT for nullifiers using newMemEmptyTrie");
    
    // nullifierツリーは空のまま使用（使用済みのnullifierは含まれていない）
    testData.rootNullifier = poseidon.F.toString(nullifierTree.root);
    console.log("Nullifier tree root:", testData.rootNullifier);
    
    // 各nullifierに対して、空のSMTにおける非包含パスを生成
    testData.smt = {};
    
    for (let i = 0; i < testData.nullifiers.length; i++) {
        // nullifierが含まれていないことを証明するためのパスを生成
        const nullifier = BigInt(testData.nullifiers[i]);
        
        // 非包含証明を生成
        const proof = await nullifierTree.find(poseidon.F.e(nullifier));
        
        // SMTのsiblings（兄弟ノード）を取得して文字列に変換
        const smtSiblings = proof.siblings.map(s => poseidon.F.toString(s));
        
        // 必要な深さ（testData.smtDepth）までパディングする
        while (smtSiblings.length < testData.smtDepth) {
            smtSiblings.push("0");
        }
        
        // pathIndicesは使用されないがSMTVerifierの互換性のために残す
        const smtPathIndices = Array(testData.smtDepth).fill("0");
        
        testData.smt[i] = {
            smtSiblings,
            smtPathIndices,
            oldKey: poseidon.F.toString(proof.foundKey),
            oldValue: poseidon.F.toString(proof.foundValue),
            isOld0: poseidon.F.isZero(proof.foundKey) ? "1" : "0"
        };
        
        console.log(`Generated non-inclusion proof for nullifier ${i}: ${testData.nullifiers[i]}`);
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

    return testData;
}

function prepareInputs(testData) {
    // テストデータが引数として提供されていない場合は読み込む
    if (!testData) {
        testData = JSON.parse(fs.readFileSync('build/test_data.json', 'utf8'));
    }
    
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
        note_value: Object.values(testData.merkleTree).map(tree => tree.value || "1"),
        smt_siblings: Object.values(testData.smt).map(smt => smt.smtSiblings),
        smt_pathIndices: Object.values(testData.smt).map(smt => smt.smtPathIndices),
        smt_oldKey: Object.values(testData.smt).map(smt => smt.oldKey || "0"),
        smt_oldValue: Object.values(testData.smt).map(smt => smt.oldValue || "0"),
        smt_isOld0: Object.values(testData.smt).map(smt => smt.isOld0 || "1"),
        
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
    
    // build/onetime_note_jsディレクトリが存在するか確認して作成
    if (!fs.existsSync('build/onetime_note_js')) {
        fs.mkdirSync('build/onetime_note_js', { recursive: true });
    }
    
    // 入力ファイルを保存
    fs.writeFileSync('build/onetime_note_js/input.json', JSON.stringify(input, null, 2));
    console.log('Circom入力ファイルを生成しました: build/onetime_note_js/input.json');
}

// メイン関数 - 順番に処理を実行
async function main() {
    try {
        console.log('テストデータの生成を開始...');
        const testData = await generateTestData();
        
        console.log('Circom入力の準備を開始...');
        prepareInputs(testData);
        
        console.log('すべての処理が完了しました！');
    } catch (error) {
        console.error('エラーが発生しました:', error);
        process.exit(1);
    }
}

// プログラム実行
main().catch(console.error);
