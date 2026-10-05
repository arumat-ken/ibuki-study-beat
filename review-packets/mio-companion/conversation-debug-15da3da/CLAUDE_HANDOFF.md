# Claude引き継ぎ — AIコンパニオン澪

更新日: 2026-10-05  
正本リポジトリ: `https://github.com/arumat-ken/mio-companion`  
対象ブランチ: この文書を含むGitHubブランチ／PR  
更新AI: Codex  
正確なモデル名: 未記録

## 引き継ぎ目的

Codexまたは他モデルの利用枠が枯渇しても、Claudeが会話履歴の推測に頼らず、GitHub上の正本から
安全に開発を再開できるようにする。Claudeはまず本書、`app/README.md`、
`docs/POSE_GESTURE_PIPELINE.md` を読み、実ファイルとテスト結果を確認してから変更する。

## 現在の状態

- Mio Callは自己ホスト型の2D AIコンパニオン。正本UIは `app/index.html`。
- 開発サーバーとMio Callのブラウザタブは、トークン消費防止のため意図的に停止・閉鎖中。
- ローカル描画、口パク、手ぶりだけではAPIトークンを消費しない。
- Gemini APIを使うのは会話応答と、設定で有効化したGemini自然音声。画像生成はアプリ実行中には行わない。
- 起動前に必ず重複サーバーと重複タブを確認する。1サーバー・1表示を原則とする。

## 会話と動作の経路

1. 端末の音声認識または文字入力を受ける。
2. Geminiへ構造化JSONを1回送る。
3. JSONの `emotion`、`strength`、`gestures[]` を検証する。
4. 発話時間に合わせ、ローカル画像を切り替えて微動させる。
5. Geminiが手ぶりを省略した場合だけ、`completeHandGestures()` が明確な語句から1つ補う。

## 登録済み8ポーズ

| ID | 意味 | 主な発動条件 |
|---|---|---|
| `wave` | 手を振る | 挨拶、別れ |
| `palm_up` | 差し出す | 説明、提案、歓迎 |
| `point_self` | 自分を指す | 澪自身への言及 |
| `index_up` | 要点を示す | 重要点、強調 |
| `think_finger` | 考える | 迷い、検討 |
| `gassho` | 両手を合わせる | お願い、感謝、謝罪 |
| `open_heart` | オープンハート | 愛情、心が通じた喜び、深い共感を明示する発話 |
| `hug_invite` | ハグを求める | 抱擁、身体的な安心・慰めを明示する発話 |

`open_heart` と `hug_invite` は希少な強い所作。一般的なお礼、軽い共感、普通の歓迎では使わない。
同一の意味区間で両方を同時発動しない。ハグ原本は全身で保存し、表示を近づける場合も左右の手を
切らないこと。

## 重要ファイル

- `app/index.html` — UI、Geminiプロンプト、構造化出力、動作選択、描画、音声
- `app/tests/handGestures.test.ts` — ポーズ資産と発動条件
- `app/tests/selfHostedVoice.test.ts` — 会話JSONと音声経路
- `app/public/gestures/` — 実行時の確定画像
- `reference/gestures/*/manifest.json` — 原本、hash、採用状態
- `reference/gestures/*/qa.json` — 人体・左右・用途の検証記録
- `docs/POSE_GESTURE_PIPELINE.md` — 骨格ガイドと画像生成の運用

## Claudeへの依頼

1. 引き継ぎ時は `git status`、現在ブランチ、最新コミット、PRを確認する。
2. 本書にない画像・モデル名・合格判定を推測しない。モデル名を確認できなければ「未記録」。
3. 変更前後に `npm test`、`npm run build`、`git diff --check` を実行する。
4. Mio Callを起動する必要がある場合、ポート5173の既存プロセスを確認し、重複起動しない。
5. 動作確認後は通話を終了し、不要なMio Callタブと開発サーバーを停止する。
6. APIキー、会話内容、秘密情報をGitHubへ保存しない。
7. 次担当へ渡す際は、完了・未完了・検証結果・サーバー稼働状態を本書へ追記する。

## 再開チェック

```text
[ ] GitHubの最新ブランチ／PRを取得した
[ ] git statusでユーザーの未保存作業を確認した
[ ] 5173番の重複サーバーがない
[ ] 8画像とmanifest/qaのhashを確認した
[ ] テストとビルドが合格した
[ ] 実機確認後、API通信を停止した
```
