## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

-   **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
-   **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
-   **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
-   **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```


# Circom

[https://docs.circom.io/getting-started/installation/](https://docs.circom.io/getting-started/installation/)

## Install
```sh
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom
```

## Install snrakjs
```sh
npm install -g snarkjs
```

## Build
```sh
circom circuits/onetime_note.circom --r1cs --wasm --sym -l . -l node_modules -o build
```

# ワンタイムノート回路のテスト

## テストデータの生成と検証手順

以下の手順でワンタイムノート回路のテストと検証を行います。

1. **回路のビルド**
   ```sh
   circom circuits/onetime_note.circom --r1cs --wasm --sym -l . -l node_modules -o build
   ```

2. **テストデータの生成**
   ```sh
   pnpm run gen
   ```

4. **証明の生成と検証**
   ```sh
   # 証明鍵の生成（テスト用、実運用環境では信頼できるセットアップが必要）
   pnpm run setup-keys
   
   # 証明の生成
   # 最初にwitness（回路の実行証跡）を計算
   pnpm run generate-witness
   
   # 次に証明を生成
   pnpm run generate-proof
   
   # 証明の検証
   pnpm verify-proof
   ```

5. **結果の解釈**
   
   検証が成功した場合、以下のような出力が表示されます：
   ```
   [INFO]  snarkJS: OK!
   ```
   
   これは、生成したテストデータが有効で、回路の制約を正しく満たしていることを示します。

### テストケースの追加

様々なシナリオでテストを行うために、以下のようなテストケースを追加することも可能です：

1. 金額が一致しない場合（sumIn != sumOut）
2. 無効なNullifier値の場合
3. 無効なマークルパスの場合
4. 無効な署名の場合

各テストケースでは、`generate_test_data.js`を修正して異なる値を生成し、それぞれの場合で検証が失敗することを確認します。
