# 1.0.6 セキュリティ確認記録

確認日：2026年10月19日。既知の脆弱性と取得元の確認記録です。未発見の問題や、正規の公開者自身が混入させた不正コードまで否定するものではありません。

## Node.jsとGitHub Actions

CI注釈で、checkout、setup-node、setup-dotnet、upload-artifactがNode.js 20向けで、ランナーがNode.js 24へ強制切り替えしていることを確認しました。アプリ同梱Node.js 20のエラーではありません。

使用Actionとdownload-artifactを、公式リポジトリで署名を確認したNode.js 24対応コミットに固定しました。ビルド用とWindows同梱Node.jsは24.22.0へ更新し、Windowsバイナリの公式SHA-256を固定しています。Electronは44.9.0へパッチ更新しました。

## npm依存

Next.jsとeslint-config-nextを16.4.2、Sharpを0.35.5へ更新しました。変更された依存の取得元はすべて公式npmレジストリで、lockfileのintegrityを確認しています。

| 確認範囲 | 結果 |
| --- | --- |
| 更新前・開発依存込み | 15件（High 7、Moderate 8） |
| 更新後・本番依存のみ | 0件 |
| 更新後・開発依存込み | 13件（High 5、Moderate 8） |
| ローカルでのレジストリ署名 | 624パッケージを検証 |
| 同環境でのprovenance | 150件のattestationを検証 |

署名数は環境ごとのoptional依存で変わります。署名の一致は取得元と整合性の確認で、コードの無害性を保証するものではありません。

`.npmrc`とCIではインストール時スクリプトを自動実行せず、`npm audit signatures`の後に必要なビルドを明示的に実行します。Prisma生成などは残しています。全パッケージのソースやネイティブバイナリの完全な手動解析は行っていません。

## 未修正の開発依存

残る13件は次の2件と依存元への波及です。確認日時点で修正版は未公開です。

- [braces / GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)：深くネストしたパターンによるスタック枯渇。ESLint設定のglob依存から参照されます。
- [sprintf-js / GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)：大きな精度指定によるサービス拒否。electron-builder側の依存から参照されます。

開発用だから無条件に安全とは扱いません。外部から提供されたglobや書式文字列をビルド設定へ取り込まない運用が必要です。

`desktop/security-audit.cjs`は本番依存の指摘、新しいアドバイザリ、Criticalの検出時に失敗します。既知2件の例外は2026年10月26日までで、その後は再確認なしで通しません。結果は`dist/security-audit.json`に記録します。

## 追加確認が必要な範囲

[Node.js公式予告](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)では、10月21日以降に22・24・26系へ最大Highの更新が予定されています。10月19日時点では未公開です。24.22.0への更新だけで予告分の対策が済んだとは扱えません。公開後にランタイムと公式ハッシュを再確認する必要があります。

npm監査にはNode.js本体、Electron内蔵Chromium、.NET、OS共有WebView2の脆弱性は含まれません。WebView2はEvergreen方式を維持し、.NET同梱物とOS更新も別途管理する必要があります。
