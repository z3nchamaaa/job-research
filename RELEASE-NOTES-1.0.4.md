# v1.0.4 配布候補

Windows版の画面をElectronからWebView2へ移行しました。macOSとLinuxはElectronを継続します。Windowsのアプリケーションメニューバーは表示しません。

## Windows版

WebView2はEvergreen方式です。ブラウザー本体をアプリに同梱せず、必要なPCだけインストーラーからMicrosoftの共有Runtimeを導入します。その場合はインターネット接続が必要です。Node.jsと.NETは同梱しています。

x64とARM64のEXEインストーラーを用意しています。Windows 11以降が対象です。ARM64版の内部サーバーはx64 Node.jsで動くため、Windowsのx64エミュレーションを使用します。

## 切り替え手順

旧Electron版を終了し、`%APPDATA%\syukatsu-tracker-desktop`をバックアップしてからインストールしてください。DBと就活軸は同じ保存先を使用します。旧版と新版を同時に起動しないでください。

ChatGPTにはログインし直してください。WebView2版の認証情報は`webview-auth`に分けて保存します。Electron版の認証ファイルは変更しません。試作版1.0.4-devの別データは自動移行しません。

## 配布前の確認

CIでは各OSのビルドに加え、Windows x64のインストール、WebView2起動、DPAPI、企業と予定の登録、同じDBでの再起動、通常終了と強制終了時の内部プロセス停止、アンインストールを検査します。ブラウザー本体や個人データが同梱されていないことも確認します。

実アカウントでのChatGPTログインとAI生成、カレンダーファイルの保存、Windows ARM64実機での操作は、正式公開前に手動確認が必要です。Windowsインストーラーは未署名のため、OSの警告が出る場合があります。

この段階では配布候補の製作のみです。既存の正式ReleaseとLatestは変更していません。
