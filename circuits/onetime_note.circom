pragma circom 2.0.0;

// circomlib の必要な回路をインクルード
include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/eddsaposeidon.circom";
include "node_modules/circomlib/circuits/smt/smtverifier.circom";

// OneTimeNoteProof テンプレート：
// ワンタイムノートの nullifier、ノート自体の正当性、署名検証、および SMT での非包含証明を実装
template OneTimeNoteProof(nLevels) {

    // --- 入力信号 ---
    // ワンタイムノートの要素
    signal input amount;                // ノートに含まれる金額（プライベート）
    signal input encryptedReceiver;     // 暗号化された受取人アドレス（プライベート）
    signal input rho;                   // ワンタイムノート用のランダム値（プライベート）

    // SMT 検証用の入力
    signal input pathIndices[nLevels];  // Sparse Merkle Tree 経路の各ビット（0 or 1）
    signal input siblings[nLevels];     // SMT の兄弟ノードハッシュの配列

    // 署名検証用の入力
    signal input Ax;  // 署名者の公開鍵（x座標）
    signal input Ay;  // 署名者の公開鍵（y座標）
    signal input R8x; // 署名の R8 の x座標
    signal input R8y; // 署名の R8 の y座標
    signal input S;   // 署名の S 値

    // --- 出力信号 ---
    signal output nullifier;            // 計算された nullifier（公開としても利用可能）
    signal output noteHash;             // ワンタイムノートのハッシュ
    signal output smtRoot;              // SMT におけるルートハッシュ
    signal output sigValid;             // 署名検証結果（1: 有効, 0: 無効）

    // --- 回路内部処理 ---
    // 1. Poseidon を使って内部ハッシュを計算
    // ノートハッシュ: noteHash = Poseidon([amount, encryptedReceiver, rho])
    component poseidonNote = Poseidon(3);
    poseidonNote.inputs[0] <== amount;
    poseidonNote.inputs[1] <== encryptedReceiver;
    poseidonNote.inputs[2] <== rho;
    noteHash <== poseidonNote.out;

    // 2. Nullifier の計算:
    // 例として、nullifier = Poseidon([amount, encryptedReceiver, Poseidon([rho])])
    component poseidonRho = Poseidon(1);
    poseidonRho.inputs[0] <== rho;
    component poseidonNullifier = Poseidon(3);
    poseidonNullifier.inputs[0] <== amount;
    poseidonNullifier.inputs[1] <== encryptedReceiver;
    poseidonNullifier.inputs[2] <== poseidonRho.out;
    nullifier <== poseidonNullifier.out;

    // 3. Sparse Merkle Tree による非包含証明
    // SMTVerifier 回路により、nullifier が既存の使用済みノート集合に含まれていないことを証明
    // ※ SMTVerifier テンプレートは、SMT のルートと入力経路から対象要素の存在/非存在を検証します。
    component smtVerifier = SMTVerifier(nLevels);
    // SMTVerifier の入力は対象要素（ここでは nullifier）と、経路情報
    smtVerifier.leaf <== nullifier;
    for (var i = 0; i < nLevels; i++) {
        smtVerifier.pathIndices[i] <== pathIndices[i];
        smtVerifier.siblings[i] <== siblings[i];
    }
    // SMT のルート（既に使用済みノートの集合のルート）を出力
    smtRoot <== smtVerifier.root;

    // 4. EdDSA Poseidon を使った署名検証
    // 署名対象として noteHash を利用
    component eddsa = EdDSAPoseidonVerifier();
    eddsa.enabled <== 1;          // 署名検証を有効化
    eddsa.Ax <== Ax;
    eddsa.Ay <== Ay;
    eddsa.R8x <== R8x;
    eddsa.R8y <== R8y;
    eddsa.S <== S;
    eddsa.M <== noteHash;         // 署名の対象メッセージとしてノートハッシュを使用
    // 署名が正しい場合、内部制約が成立し、回路は整合性を持つ

    // 出力: 署名が正しければ 1 を出力
    // （この例では、署名検証に失敗した場合は回路全体が矛盾するため、sigValid は常に 1 となる）
    sigValid <== 1;
}

// メイン回路：MerkleProof に必要な SMT 経路長を例として 20 を使用
component main = OneTimeNoteProof(20);
