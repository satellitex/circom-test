# ZKP 実行環境および性能計測結果

## 概要

このドキュメントでは、ワンタイムノートのZero-Knowledge Proof（ZKP）システムの実行環境と性能計測結果をまとめています。

## 実行環境

- **ハードウェア**:
  - **モデル**: MacBook Pro (MNWA3TG/A)
  - **チップ**: Apple M2 Max
  - **コア数**: 12 (8パフォーマンスコア、4効率コア)
  - **メモリ**: 32 GB
- **プロジェクト名**: verify-onetime
- **Node.js バージョン**: 23.9.0 (volta管理)
- **主要ライブラリ**:
  - circomlib v2.0.5
  - circomlibjs v0.1.7
  - snarkjs v0.7.5
  - keccak-circom (GitHub: vocdoni/keccak256-circom)
  - ethereum-cryptography v3.1.0

## 回路構成

メイン回路は以下のコンポーネントで構成されています：

- **ConsumeNoteCircuit**: 既存ノートの消費・検証
  - Nullifierの計算
  - Sparse Merkle Tree による非包含証明
  - ワンタイムノートの包含証明

- **CreateNoteCircuit**: 新規ノート作成
  - ノートのハッシュ値計算

- **MainCircuit**: メイン検証回路
  - 入力ノートの消費（ConsumeNoteCircuit）
  - 出力ノートの作成（CreateNoteCircuit）
  - 送金額合計の検証
  - 署名検証（EdDSA Poseidon）
  - 公開鍵の検証（Keccak256）

## 回路の複雑性

回路ビルド結果から得られた複雑性指標：

| 指標 | 値 | 説明 |
|------|------|------|
| テンプレートインスタンス | 487 | 回路内で使用される再利用可能なコンポーネントの総数。複雑な回路ほど多くのインスタンスを持つ |
| 非線形制約 | 298,653 | 乗算などの非線形演算を表す制約式の数。計算コストが高く、証明生成時間に大きく影響する |
| 線形制約 | 237,817 | 加算や減算などの線形演算を表す制約式の数。比較的計算コストが低い |
| 公開入力 | 8 | 検証者にも開示される入力値の数（ルートハッシュ値など） |
| 秘密入力 | 539 | 証明者のみが知る秘密情報の数（プライベートキーなど） |
| 公開出力 | 0 | 回路から出力される公開値の数。この回路では明示的な公開出力がない |
| ワイヤー数 | 536,974 | 回路内の信号線（変数）の総数。制約の複雑さを表す指標の一つ |
| ラベル数 | 2,721,743 | コンパイル時に生成される一意の識別子の数。回路の記述サイズに関連 |

これらの数値は回路の計算複雑性を表し、特に制約数はWitness生成およびプルーフ生成の処理時間に直接影響します。

### ビルドログ

```
➜  verify-onetime git:(feat/gen-test-all) pnpm build-circuit

> verify-onetime@1.0.0 build-circuit /Users/publicnetworks/turingum/verify-onetime
> circom circuits/onetime_note.circom --r1cs --wasm --sym -l . -l node_modules -o build

template instances: 487
non-linear constraints: 298653
linear constraints: 237817
public inputs: 8
private inputs: 539
public outputs: 0
wires: 536974
labels: 2721743
Written successfully: build/onetime_note.r1cs
Written successfully: build/onetime_note.sym
Written successfully: build/onetime_note_js/onetime_note.wasm
Everything went okay
```

## 性能計測結果

| 処理内容 | 実行時間 | CPU使用率 |
|---------|---------|---------|
| Witness生成 | 1.346秒 | 125% |
| Proof生成 | 14.764秒 | 681% |
| Proof検証 | 0.735秒 | 131% |

### 詳細な実行ログ

```
➜ time pnpm run generate-witness
> verify-onetime@1.0.0 generate-witness /Users/publicnetworks/turingum/verify-onetime
> cd build/onetime_note_js && node generate_witness.js onetime_note.wasm ../../input/test_data.json witness.wtns

pnpm run generate-witness  1.58s user 0.11s system 125% cpu 1.346 total

➜ time pnpm run generate-proof
> verify-onetime@1.0.0 generate-proof /Users/publicnetworks/turingum/verify-onetime
> cd build/onetime_note_js && npx snarkjs groth16 prove onetime_note_0001.zkey witness.wtns proof.json public.json

pnpm run generate-proof  95.62s user 4.97s system 681% cpu 14.764 total

➜ time pnpm run verify-proof
> verify-onetime@1.0.0 verify-proof /Users/publicnetworks/turingum/verify-onetime
> cd build/onetime_note_js && npx snarkjs groth16 verify verification_key.json public.json proof.json

[INFO]  snarkJS: OK!
pnpm run verify-proof  0.83s user 0.14s system 131% cpu 0.735 total
```

## 分析

1. **Witness生成 (1.35秒)**
   - 回路とプライベート入力から証明に必要なwitnessを生成
   - 比較的軽量な処理で、CPU使用率も低め（125%）

2. **Proof生成 (14.76秒)**
   - 計算量の多い処理で、全体の処理時間の約88%を占める
   - 高いCPU使用率（681%）から、マルチコアをフル活用
   - snarkjsによるGroth16プルーフシステムを使用

3. **Proof検証 (0.74秒)**
   - 検証処理は非常に高速（生成の約1/20の時間）
   - これはZKPシステムの特性通り（生成は重いが検証は軽い）

## 考察

- Proof生成は計算集約型であるため、マルチコアCPUの恩恵を大きく受けている（681%のCPU使用率）
- 検証処理は高速であり、ブロックチェーンなどのオンチェーン検証に適している
- MainCircuitの複雑性（ノート消費、作成、署名検証等）を考慮すると、全体的に良好なパフォーマンスを示している

## 最適化の余地

- Witness生成とProof生成の並列化によるさらなる高速化
- より効率的なハッシュ関数や制約の最適化による計算量削減
- より高速なzk-SNARKライブラリの採用検討

## テストネット検証結果

### コントラクトビルドサイズ

| コントラクト | ランタイムサイズ (B) | イニットコードサイズ (B) | ランタイム余裕 (B) | イニットコード余裕 (B) |
|------------|-------------------|----------------------|-----------------|-------------------|
| Groth16Verifier | 2,001 | 2,030 | 22,575 | 47,122 |

### Deployed contract
| 項目 | 詳細 |
|------|------|
| **コントラクト概要** | |
| 名称 | Groth16Verifier | 
| ネットワーク | Sepoliaテストネット |
| 作成トランザクション | 0x331fcc292320cc7f375573e03842c06f804f586f7c60e08f96b24da37226c416 |
| コントラクトアドレス | 0xEc3213b7690AC84aa0e1d95f7344d49A2085d32F |
| **ソースコード情報** | |
| コンパイラバージョン | v0.8.20+commit.a1b79de6 |
| 最適化設定 | 有効（200回のラン） |
| EVMバージョン | Shanghai |
| ライセンス | GPL-3.0 |




### 検証

| 項目 | 詳細 |
|------|------|
| 検証コントラクト | Groth16Verifier |
| コントラクトアドレス | 0xEc3213b7690AC84aa0e1d95f7344d49A2085d32F |
| 検証結果 | 成功 (true) |
| 実行時間 | 0.08秒 |
| CPU使用率 | 26% |

```
➜  verify-onetime git:(feat/verifier-sol) ✗ time forge script script/VerifyProof.s.sol --rpc-url $SEPOLIA_RPC_URL
[⠊] Compiling...
No files changed, compilation skipped
Script ran successfully.

== Logs ==
  Using deployed Groth16Verifier at: 0xEc3213b7690AC84aa0e1d95f7344d49A2085d32F
  Proof verification result: true
forge script script/VerifyProof.s.sol --rpc-url $SEPOLIA_RPC_URL  0.83s user 0.08s system 26% cpu 3.517 total
```

## まとめ

このZKPシステムは、ワンタイムノートの作成と消費を通じて、トランザクションのプライバシーを保護しながら金額の整合性と署名の正当性を保証します。性能測定結果から、プルーフ生成に若干の時間がかかるものの、検証は非常に高速であることが確認されました。これはZKPの特性を活かした実用的な実装と言えます。
