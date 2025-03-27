pragma circom 2.0.0;

// -------------------------------------------------------------
// 必要なライブラリをインポート（ユーザ指定のもの）
// -------------------------------------------------------------
include "node_modules/circomlib/circuits/poseidon.circom";           // Poseidon
include "node_modules/circomlib/circuits/eddsaposeidon.circom";     // EdDSA(Ed25519) + Poseidon
include "node_modules/keccak-circom/circuits/keccak.circom";        // Keccak256
include "node_modules/circomlib/circuits/smt/smtverifier.circom";    // Sparse Merkle Tree (SMT)証明
include "node_modules/circomlib/circuits/comparators.circom";        // 比較器等
include "node_modules/circomlib/circuits/bitify.circom";            // Num2Bits等のビット変換
// -------------------------------------------------------------
// [サブテンプレート1] ConsumeNoteCircuit
//   1つのノートを消費するときの処理:
//   - Nullifier を計算
//   - Sparse Merkle Tree で「未使用(非包含)」を証明
//   - ワンタイムノートの Merkle Inclusion を証明
//   - 金額を出力 (後で合計に使用)
// -------------------------------------------------------------
template ConsumeNoteCircuit(merkleDepth, smtDepth) {
    // ---- 入力 (外部から与えられる) ----
    signal input amount;             // ノート金額
    signal input encryptedReceiver;  // 受取人情報(暗号化)
    signal input rho;                // ランダム値

    signal input rootNullifier;      // 使用済みノート(SMT)のルート
    signal input smtSiblings[smtDepth];
    signal input smtPathIndex[smtDepth];
    signal input oldKey;             // 非包含証明用の古いキー
    signal input oldValue;           // 非包含証明用の古いキーの値
    signal input isOld0;             // 古いキーが0かどうか

    signal input rootNote;           // ワンタイムノート(SMT)のルート
    signal input notePathElements[merkleDepth];
    signal input notePathIndex[merkleDepth];
    signal input noteValue;          // ノートの値 (SMT用)

    // ---- 出力 ----
    signal output outAmount;         // ノート金額 (合計計算用)

    // (a) Nullifier を Poseidon で計算 (rhoを内部ハッシュしてもOK)
    component rhoHash = Poseidon(1);
    rhoHash.inputs[0] <== rho;

    component nullifierCalc = Poseidon(3);
    nullifierCalc.inputs[0] <== amount;
    nullifierCalc.inputs[1] <== encryptedReceiver;
    nullifierCalc.inputs[2] <== rhoHash.out;

    // ここでは Nullifier の値そのものは外に出さず、外部(メイン)で比較するときは
    // "Nullifier[i]" を別途 public input にするなどの設計が考えられます。
    // ただし本サブ回路では「Nullifier が rootNullifier に非包含であること」を証明します。

    // (b) Sparse Merkle Tree での非包含証明 (「value=0」であると仮定)
    // SMTVerifier は以下の入力を持つ:
    // - enabled: 有効/無効
    // - root: SMT ルートハッシュ
    // - siblings[]: 兄弟ノード値
    // - oldKey, oldValue: 古いキーとその値
    // - isOld0: 古いキーが0かどうか
    // - key, value: 検証するキーと値
    // - fnc: 機能コード (0:包含検証, 1:非包含検証)
    component smtVer = SMTVerifier(smtDepth);
    smtVer.root <== rootNullifier;
    smtVer.key <== nullifierCalc.out;
    smtVer.value <== 0;
    smtVer.oldKey <== oldKey;
    smtVer.oldValue <== oldValue;
    smtVer.isOld0 <== isOld0;
    smtVer.fnc <== 1; // 1: VERIFY NOT INCLUSION
    smtVer.enabled <== 1;  // 証明を有効化
    for (var d = 0; d < smtDepth; d++) {
        smtVer.siblings[d] <== smtSiblings[d];
        // 注: 実際のSMTVerifierはpathIndicesシグナルを持たないが、
        // 互換性のためsmtPathIndex入力は残している
    }

    // (c) hashedOnetimeNote = Poseidon(amount, encryptedReceiver, rho) が
    //     rootNote に含まれていること(= SMTによる包含証明)。
    component noteHash = Poseidon(3);
    noteHash.inputs[0] <== amount;
    noteHash.inputs[1] <== encryptedReceiver;
    noteHash.inputs[2] <== rho;

    // SMTVerifierを使用してノートの包含証明を行う
    component noteSMTCheck = SMTVerifier(merkleDepth);
    noteSMTCheck.root <== rootNote;
    noteSMTCheck.key <== noteHash.out;  // ノートのハッシュをキーとして使用
    noteSMTCheck.value <== noteValue;   // 存在を証明する値 (通常は1)
    noteSMTCheck.fnc <== 0;             // 0: VERIFY INCLUSION
    noteSMTCheck.enabled <== 1;         // 有効化
    
    // 包含証明の場合、oldKey/oldValueは使用しないが、SMTVerifierの仕様上必要
    noteSMTCheck.oldKey <== 0;
    noteSMTCheck.oldValue <== 0;
    noteSMTCheck.isOld0 <== 1;
    
    for (var m = 0; m < merkleDepth; m++) {
        noteSMTCheck.siblings[m] <== notePathElements[m];
        // SMTVerifierは内部でpathIndicesを使用しないが
        // 互換性のためnotePathIndex入力は残している
    }

    // (d) 出力: このノートの金額
    outAmount <== amount;
}

// -------------------------------------------------------------
// [サブテンプレート2] CreateNoteCircuit
//   1つの新規ノートを作成し、ハッシュ (hashedOnetimeNote) を出力
// -------------------------------------------------------------
template CreateNoteCircuit() {
    signal input amount;
    signal input encryptedReceiver;
    signal input rho;

    // 新規ノートのハッシュを出力
    signal output hashedNote;

    // hashedNote = Poseidon(amount, encryptedReceiver, rho)
    component noteHash = Poseidon(3);
    noteHash.inputs[0] <== amount;
    noteHash.inputs[1] <== encryptedReceiver;
    noteHash.inputs[2] <== rho;
    hashedNote <== noteHash.out;
}

// -------------------------------------------------------------
// [メイン回路] MainCircuit
//   - nIn 個の既存ノートを消費 (ConsumeNoteCircuit)
//   - nOut 個の新規ノートを作成 (CreateNoteCircuit)
//   - 送金額合計や署名検証などをまとめて実行
// -------------------------------------------------------------
template MainCircuit(nIn, nOut, merkleDepth, smtDepth) {
    // ------------------------------------------------
    // [Public Inputs] (公開入力)
    // ------------------------------------------------
    signal input rootNullifier;                    // SMTルート(使用済みノート)
    signal input rootNote;                         // Merkleルート(ワンタイムノート)
    signal input hashedSignature;                  // 署名のハッシュ
    signal input Nullifier[nIn];                   // 各ノートのNullifier (比較用)
    signal input hashedOnetimeNote_out[nOut];      // 新規ノートのハッシュ
    signal input hashedAmount;                     // 送金額(合計)のハッシュ

    // ------------------------------------------------
    // [Private Inputs] (秘密入力)
    // ------------------------------------------------
    // 消費ノートに関する情報
    signal input amount_in[nIn];
    signal input encryptedReceiver_in[nIn];
    signal input rho_in[nIn];

    signal input note_pathElements[nIn][merkleDepth];
    signal input note_pathIndex[nIn][merkleDepth];
    signal input note_value[nIn];                  // ノートの値 (SMT用)
    signal input smt_siblings[nIn][smtDepth];
    signal input smt_pathIndices[nIn][smtDepth];
    signal input smt_oldKey[nIn];
    signal input smt_oldValue[nIn];
    signal input smt_isOld0[nIn];

    // 新規ノートに関する情報
    signal input amount_out[nOut];
    signal input encryptedReceiver_out[nOut];
    signal input rho_out[nOut];

    // 署名(EdDSA Poseidon) 用の公開鍵・署名データ
    signal input Ax;
    signal input Ay;
    signal input R8x;
    signal input R8y;
    signal input S;

    // keccak 等の検証に用いる
    signal input nddnPublicKey;
    signal input rho2;  // hashedAmount 用の乱数

    // ------------------------------------------------
    // 1) 消費ノートの検証 → nIn 個
    // ------------------------------------------------
    // 合計金額を計算しながら、Nullifier と Merkle をチェック
    var sumIn = 0;

    // ConsumeNoteCircuit を nIn 個インスタンス化 (配列コンポーネント)
    component consumeNotes[nIn];
    for (var i = 0; i < nIn; i++) {
        // サブテンプレートを呼び出し
        consumeNotes[i] = ConsumeNoteCircuit(merkleDepth, smtDepth);

        // 入力を配線
        consumeNotes[i].amount <== amount_in[i];
        consumeNotes[i].encryptedReceiver <== encryptedReceiver_in[i];
        consumeNotes[i].rho <== rho_in[i];

        consumeNotes[i].rootNullifier <== rootNullifier;
        consumeNotes[i].oldKey <== smt_oldKey[i];
        consumeNotes[i].oldValue <== smt_oldValue[i];
        consumeNotes[i].isOld0 <== smt_isOld0[i];
        for (var d = 0; d < smtDepth; d++) {
            consumeNotes[i].smtSiblings[d] <== smt_siblings[i][d];
            consumeNotes[i].smtPathIndex[d] <== smt_pathIndices[i][d];
        }

        consumeNotes[i].rootNote <== rootNote;
        consumeNotes[i].noteValue <== note_value[i];
        for (var md = 0; md < merkleDepth; md++) {
            consumeNotes[i].notePathElements[md] <== note_pathElements[i][md];
            consumeNotes[i].notePathIndex[md] <== note_pathIndex[i][md];
        }

        // Nullifier[i] とサブテンプレートで計算した nullifierCalc.out を比較したいなら
        // サブテンプレートで出力してもよいが、ここでは省略 or
        // "Nullifier[i] === ...?" の制約をサブテンプレートに含める等、設計次第

        // 合計金額を加算
        sumIn += consumeNotes[i].outAmount;
    }

    // ------------------------------------------------
    // 2) 新規ノートの検証 → nOut 個
    // ------------------------------------------------
    var sumOut = 0;

    // CreateNoteCircuit を nOut 個インスタンス化
    component createNotes[nOut];
    for (var j = 0; j < nOut; j++) {
        createNotes[j] = CreateNoteCircuit();

        // 入力を配線
        createNotes[j].amount <== amount_out[j];
        createNotes[j].encryptedReceiver <== encryptedReceiver_out[j];
        createNotes[j].rho <== rho_out[j];

        // 出力 hashedNote と hashedOnetimeNote_out[j] を比較
        hashedOnetimeNote_out[j] === createNotes[j].hashedNote;

        // 合計を加算
        sumOut += amount_out[j];
    }

    // ------------------------------------------------
    // 3) 金額合計 (sumIn === sumOut)
    // ------------------------------------------------
    sumIn === sumOut;

    // ------------------------------------------------
    // 4) hashedAmount = Poseidon(sumIn, rho2)
    // ------------------------------------------------
    component amountHash = Poseidon(2);
    amountHash.inputs[0] <== sumIn;
    amountHash.inputs[1] <== rho2;
    amountHash.out === hashedAmount;

    // ------------------------------------------------
    // 5) 署名検証 (EdDSA Poseidon)
    // ------------------------------------------------
    // ここで メッセージを計算
    component msgHash = Poseidon(2);
    msgHash.inputs[0] <== encryptedReceiver_in[0];
    msgHash.inputs[1] <== rho_in[0];

    // circomlib/eddsaposeidon.circom の回路名に合わせて修正
    component eddsaCheck = EdDSAPoseidonVerifier();
    eddsaCheck.enabled <== 1; // 必須のenabled入力パラメータを追加
    eddsaCheck.Ax <== Ax;
    eddsaCheck.Ay <== Ay;
    eddsaCheck.R8x <== R8x;
    eddsaCheck.R8y <== R8y;
    eddsaCheck.S <== S;
    eddsaCheck.M <== msgHash.out;

    // hashedSignature との比較
    component sigDataHash = Poseidon(3);
    sigDataHash.inputs[0] <== R8x;
    sigDataHash.inputs[1] <== R8y;
    sigDataHash.inputs[2] <== S;
    sigDataHash.out === hashedSignature;

    // ------------------------------------------------
    // 6) keccak_256(publicKey)[-20:] == nddnPublicKey
    // ------------------------------------------------
    // 公開鍵 (Ax, Ay) をビット配列に変換
    // 注: EdDSA公開鍵は X, Y 座標のペアなので、連結して入力とする
    component pkToBitsX = Num2Bits(254); // 254ビットに制限（Poseidonの制約）
    component pkToBitsY = Num2Bits(254);
    pkToBitsX.in <== Ax;
    pkToBitsY.in <== Ay;
    
    // 公開鍵のビット配列（X||Y）を作成 - 合計 508 ビット
    var pkBits[508];
    for (var i = 0; i < 254; i++) {
        pkBits[i] = pkToBitsX.out[i];
        pkBits[254+i] = pkToBitsY.out[i];
    }
    
    // keccak-256 ハッシュを計算
    component pkHash = Keccak(508, 256); // 入力508ビット、出力256ビット
    for (var i = 0; i < 508; i++) {
        pkHash.in[i] <== pkBits[i];
    }
    
    // ハッシュの最後の160ビット（20バイト）を抽出
    // nddnPublicKey も160ビットに変換
    component nddnPkToBits = Num2Bits(160);
    nddnPkToBits.in <== nddnPublicKey;
    
    // 最後の160ビットを比較
    for (var i = 0; i < 160; i++) {
        pkHash.out[256 - 160 + i] === nddnPkToBits.out[i];
    }
}

// メイン回路のインスタンス
component main = MainCircuit(2, 2, 20, 160);
