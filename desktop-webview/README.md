# Windows WebView2版

1.0.4の配布候補では、WindowsだけWebView2へ切り替えます。macOSとLinuxは既存のElectron版を維持します。Windowsの画面にはアプリケーションメニューバーを付けません。

## インストール

`job-research-1.0.4-win-x64.exe`または`job-research-1.0.4-win-arm64.exe`を実行してください。Windows 11以降が対象です。インストール先はユーザーごとの`%LOCALAPPDATA%\Programs\job-research-webview`です。

WebView2 Evergreen Runtimeがなければ、インストーラーからMicrosoftの導入処理を実行します。その場合はインターネット接続が必要です。Node.jsと.NETは同梱します。ChromiumとElectronはWindows版に同梱しません。

ARM64版でも内部Node.jsはx64です。Windows 11 ARMのx64エミュレーションを使用します。

## Electron版からの切り替え

旧アプリを終了し、念のため`%APPDATA%\syukatsu-tracker-desktop`をバックアップしてからインストールしてください。旧アプリを終了した状態でフォルダ全体をコピーします。

正式版のDBと就活軸は、Electron版と同じ保存先を使います。コピーやDB初期化は行いません。旧版と新版を同時に起動しないでください。旧Electron版の自動アンインストールは行いません。

ChatGPTにはログインし直してください。WebView2版の認証情報は保存先内の`webview-auth`に分け、WindowsのDPAPIで暗号化します。Electron版の`auth.enc`と`host_id.txt`は変更しません。復号できない場合はアプリ内のログアウト・再ログインで対処します。

アンインストーラーはアプリ本体だけを削除し、DBや就活軸、認証ファイルは残します。

## 開発版

`-p:WebViewDevelopment=true`でビルドすると、データを`%LOCALAPPDATA%\job-research-webview-dev`に分離します。タイトルにも開発版と表示します。既存の1.0.4-devはこの試作用保存先を使っています。試作用DBを正式版へ自動移行する処理はありません。

## ビルドと検証

WindowsではNode.js 24.21.0、.NET 10 SDK、Inno Setup 6を使用します。

```powershell
npm ci
npm run desktop:build
npm run desktop:test
./desktop-webview/build.ps1 -Rid win-x64
./desktop-webview/smoke-install.ps1 ./dist/job-research-1.0.4-win-x64.exe
```

ARM64インストーラーは`-Rid win-arm64`で作成します。ブートストラッパーは公式URLからダウンロードし、Microsoftの署名を確認して同梱します。

`Desktop release builds`はWindowsのインストーラー2本、macOSのDMG、LinuxのDEBとRPMを作成します。このビルドだけでは正式Releaseを公開しません。

x64のCIではインストールしたアプリを使用して、WebView2起動、DPAPI、就活軸の保存、企業と予定の登録、同じデータでの再起動、通常終了と強制終了時のNode停止、アンインストールを確認します。データ保存先と認証ファイルの分離はユニットテストでも検査します。

実アカウントでのChatGPTログインとAI生成、カレンダーファイルの保存、Windows ARM64実機での操作は、正式公開前に手動確認が必要です。コード署名のないWindowsインストーラーにはSmartScreenの警告が出る場合があります。

参考：[WebView2の配布](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)、[Inno Setup](https://jrsoftware.org/isinfo.php)
