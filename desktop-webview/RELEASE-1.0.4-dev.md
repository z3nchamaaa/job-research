Windows向けのWebView2試作版です。x64とARM64のZIPを公開します。macOS版とLinux版は含みません。

## 起動方法

ZIPをすべて展開し、`JobResearch.WebView.exe`を起動してください。Microsoft WebView2 Evergreen Runtimeが必要です。Node.jsと.NETは同梱しています。EXEだけを移動すると起動できません。

## 保存データ

保存先は`%LOCALAPPDATA%\job-research-webview-dev`です。既存のElectron版とは別データで動きます。企業情報や就活軸は新しく登録し、ChatGPTにもログインし直してください。既存データの自動移行は行いません。

## 確認状況と制約

x64版ではWebView2の起動、認証情報の暗号化と復号、就活軸の保存、企業と予定の登録、終了時の内部プロセス停止を自動テストしています。

実アカウントでのChatGPTログインとAI生成、カレンダーファイルの保存、ARM64実機での操作は未確認です。ARM64版の内部Node.jsはx64のため、Windows 11 ARMのx64エミュレーションを使用します。

試作版として公開するプレリリースです。正式版のLatestは変更しません。検証用データでお試しください。ダウンロードファイルの照合には`SHA256SUMS.txt`を使えます。
