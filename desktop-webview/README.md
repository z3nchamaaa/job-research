# Windows WebView2試作

`dev-webview` 専用の比較用ビルドです。既存のElectron版と公開Releaseは変更しません。

Windows FormsとWebView2で画面を表示し、既存のNext.js、Node.js、Prisma、ChatGPT連携処理を使います。Rust環境を追加せずWindows専用の外枠を試すため、今回はTauriではなく.NET 10を使っています。.NETとNode.jsは同梱します。ChromiumやElectronは同梱しません。

## 起動

CI成果物のZIPをすべて展開し、`JobResearch.WebView.exe` を起動します。EXEだけを移動すると起動できません。MicrosoftのWebView2 Evergreen Runtimeが必要です。この試作ZIPにはRuntimeの自動インストール処理を含めていません。

保存先は `%LOCALAPPDATA%\job-research-webview-dev` です。既存Electron版の企業データ、就活軸、認証情報は読み込みません。試作版では新しく登録してください。Windows ARM64版でも内部Node.jsはx64のため、Windows 11 ARMのx64エミュレーションを使います。

## 認証と通信

- 認証情報はWindowsのDPAPIを使い、現在のWindowsユーザー向けに暗号化します。平文保存への切り替えはありません。
- 既存の認証ファイルとは形式と保存先が異なるため、ログインし直す必要があります。
- WebViewから呼べる操作は既存のデスクトップAPIだけです。任意コマンド実行や任意ファイル読み込みは公開しません。
- 内部サーバーはランダムなループバックポートで起動し、認証ヘッダーをネイティブ側で付けます。トークンは画面に渡しません。外部サイトや子フレームにはブリッジを注入しません。
- OAuthや企業サイトのHTTPSリンクは外部ブラウザで開きます。アプリ終了時に内部プロセスも終了します。

## Windowsでのビルド

Node.js 24.21.0、.NET 10 SDKが必要です。

```powershell
npm ci
npm run desktop:build
npm run desktop:test
npm run webview:test
npm run desktop:prepare-win-arm64
npm run webview:prepare
dotnet publish desktop-webview/WebViewHost.csproj -c Release -r win-x64 --self-contained true -o dist/webview/win-x64
```

ARM64版は最後の行の `win-x64` を両方 `win-arm64` に置き換えます。`desktop:prepare-win-arm64` は名前にARM64が含まれますが、この試作では両版のNode.js同梱に使用します。

GitHub Actionsの `Windows WebView2 experiment` を `dev-webview` で実行すると、x64とARM64のZIP、SHA-256を作成します。正式Releaseには添付しません。

## 確認範囲

CIでは既存のデスクトップテストに加え、通信ブリッジの許可範囲を検査します。x64版では実際のDPAPI暗号化と復号、WebView2起動、認証なしHTTP要求の拒否、プロフィール保存、企業と予定の登録、終了時の内部プロセス停止を確認します。ARM64版の起動はx64のCIマシンでは検証できません。

実アカウントでのChatGPTログイン、AI生成、カレンダーファイルの保存、Windows ARM64実機での操作は別途確認が必要です。ZIPとElectron版EXEは圧縮方式やインストール機能が異なるため、サイズは配布方式込みの比較です。インストール後のサイズもCIに記録します。

## 初回の測定結果（2026-10-09）

| Windows版 | Electron 1.0.3のインストーラー | WebView2試作ZIP | ZIP展開後 |
| --- | ---: | ---: | ---: |
| x64 | 182.5 MB | 188.3 MB | 476.7 MB |
| ARM64 | 206.0 MB | 185.9 MB | 490.6 MB |

MBは1,000,000バイトです。WebView2共有Runtimeの容量は含みません。圧縮方式も異なるため、描画エンジン単体の削減量を示す数字ではありません。今回の同梱構成では、x64版の配布ファイルは約3%大きく、ARM64版は約10%小さくなりました。WebView2に替えるだけで大幅に小さくなる、という結果ではありません。

[測定と起動テストのCI](https://github.com/z3nchamaaa/job-research/actions/runs/37908302183)では、両版のビルドとx64版の起動テストが通りました。Node.jsと.NETの同梱を維持するか、別途インストールを必要とする配布にするかは、今後の判断点です。

参考：[WebView2の配布](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)、[Windows DPAPI](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata)
