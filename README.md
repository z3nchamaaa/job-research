# 就活Tracker

応募先や選考日程を管理するローカルアプリです。企業情報の調査にはChatGPTを使えます。

公開ソースには、就活データや認証情報、個人のプロフィールを含めていません。

---

## 開発・利用方法

### 1. 依存関係のインストール

```bash
# Node.js 22.18以降の22系、または24以降を使用してください
npm ci
cp .env.example .env
```

### 2. デスクトップ版の操作

本番利用はデスクトップ版（Electron）を使用します。

```bash
# アプリケーションのビルド (Next.js standalone + runtimeステージング)
npm run desktop:build

# アプリケーションの起動
npm run desktop:start
# または
npm start

# パッケージング (macOS向け: ./dist/mac-arm64/ に出力)
npm run desktop:pack

# DMGインストーラの作成
npm run desktop:dist

# デスクトップモジュールのテスト実行
npm run desktop:test
```

- **標準出力先**: `dist/mac-arm64/Syukatsu Tracker.app`
- **ビルド環境**: Apple Silicon Mac向けの未署名ローカル `.app` として生成されます。

### Windows版のビルド

```bash
npm run desktop:build
npm run desktop:prepare-win-arm64

# Windows ARM64
npx electron-builder --win nsis --arm64 --publish never

# Windows x64
npx electron-builder --win nsis --x64 --publish never
```

インストーラーは `dist/` に出力します。互換ランタイムの準備にはインターネット接続が必要です。Node.jsとSharpの取得時にチェックサムを確認します。

Windows ARM64版はWindows 11 ARMでの利用を想定しています。画面はARM64のElectron、内部サーバーは同梱したx64 Node.jsで動きます。PrismaのDBエンジンがx64専用のため、内部サーバーにはWindowsのx64エミュレーションを使います。

配布ファイルは未署名です。Windows実機でのインストール・起動は未確認です。

### 3. UI開発用プレビュー（オプション）

UIコンポーネントや画面デザインの確認・ローカル開発用途として、ループバック限定の開発サーバーを利用できます。

```bash
npm run dev
```

- `127.0.0.1` または `localhost` からのアクセスのみ許可されます。
- 外部公開用のWebサービス・本番サーバーではありません。
- 通常のNext.jsビルド単体確認は `npm run build` を使用します。

---

## データ管理・保存先

データはすべてローカルの独立したSQLiteデータベースに保存されます。

- **保存先**: `~/Library/Application Support/syukatsu-tracker-desktop/syukatsu.db`
- Windowsの保存先は `%APPDATA%\\syukatsu-tracker-desktop\\syukatsu.db` です。
- 初回起動時にクリーンなテンプレートDBから自動生成・初期化され、安全に保管されます。

---

## 環境変数

デスクトップ版の通常利用において、環境変数の設定は一切不要です。

- **DATABASE_URL**: UIプレビューやPrismaコマンドでは `.env` に `DATABASE_URL="file:./dev.db"` を設定し、開発用DBを使用します。Electronはこの設定とは独立して、上記userDataディレクトリの `syukatsu.db` を使用します。

---

## AI機能（ChatGPT連携）

デスクトップ版アプリ内からChatGPTと連携し、公開企業情報の調査および登録案（JSON）の自動作成が行えます。

1. **企業名入力**: 調査したい企業名を入力します。
2. **ChatGPT連携**: 「Continue with ChatGPT」からブラウザ経由でOpenAIアカウントと連携します。
3. **登録案の生成**:
   - 志望軸やプロフィールを含む共通プロンプトを使用し、企業名をもとにWeb検索を実行して情報を収集します。
   - Web検索の可否は、連携しているChatGPTアカウントのプランや選択モデルに依存します。
   - ポリシーエラー等でWeb検索やツール実行が拒否された場合、自動でのテキストフォールバックは行われません（モデルを変更するか、手動でプロンプトをコピーして利用してください）。
   - 想定年収は万円単位の整数（四捨五入）として正規化されます。
4. **確認と登録**: 生成されたJSON／登録案をユーザー自身が確認・修正した上で、「JSONから登録する」ボタンにより明示的にローカルDBへ登録します。
5. **認証情報**: ChatGPTの認証情報は、OSの暗号化機能（safeStorage）を使って保存します。企業のマイページに登録したIDやパスワードはAIに送りません。就活軸に秘密情報を入力しないでください。

---

## 就活軸・キャリアプロフィール

AIプロンプトを利用する際、個人の志望業界や就活の軸（強み・経験など）を設定しておくことで、生成される企業情報案の精度を高めることができます。

- **初回起動時の設定 (ファーストラン)**: アプリの初回利用時にチュートリアルとして就活軸の設定モーダルが自動的に開きます。全ての項目は任意（オプション）です。後から設定をスキップすることも可能です。
- **再編集**: ヘッダー右上の「就活軸を編集」アイコンからいつでも再入力・編集が可能です。
- **データの保存先**: 就活軸の情報は、ローカル環境の `~/Library/Application Support/syukatsu-tracker-desktop/career-profile.json` に保存されます（レポジトリには含まれません）。
- **プライバシーについて**: 登録されたプロフィール情報は端末内にのみ保存され、明示的に「AIプロンプトで登録」を実行した際、または手動でプロンプトをコピーして利用する際に限り、AIへの送信プロンプトに含まれます。個人を特定する情報（氏名、住所、パスワード等）は絶対に入力しないでください。
