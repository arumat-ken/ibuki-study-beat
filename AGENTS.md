# IBUKI STUDY BEAT — Codex作業規約

このリポジトリでは、**作業開始前に必ずGitのタスク台帳を確認する**。新しい依頼を受けても、台帳にbacklogとして記録されるまでは実装しない。

## 開始手順（必須）

1. `git status --short --branch` と `git log -1 --oneline` を確認する。
2. [`docs/exchange/TASK_BOARD.md`](docs/exchange/TASK_BOARD.md) と対象の `docs/exchange/tasks/<ID>.md` を読む。
3. `node scripts/ai-task.mjs audit` を実行する。
4. 対象が `ready` で、自分のWIPが0件であることを確認してから `claim <ID> --actor codex` を実行する。
5. claimの節目を `snapshot` してから実装を始める。

## Codexの境界

- Codexは設計、UIレビュー、仕様整合、独立検証、引き渡し機構を担当する。
- `index.html` / `css/app.css` / `js/*.js` / `sw.js` の本番実装は原則変更しない。Claude Code担当である。
- `main` へ直接pushしない。`codex/*` の専用ブランチとPull Requestを使う。
- 未確定仕様を推測で実装しない。必要ならタスクをblockし、親に判断を求める。

## 安全条件

- 保存キー `ibukiStudyBeat.v3`、外部通信ゼロ、学習グラフの中核仕様、黒×ゴールドのBEATスター世界観を守る。
- GUIを変更するタスクでは、右上にリリース版・更新日・更新AI・正確なモデル名（不明なら「未記録」）を表示する。更新頻度などの運用値はGUIまたはREADMEに既定値と妥当範囲を示す。
- 外部API・監視は重複実行を防ぎ、最終成功時刻・エラー・データ鮮度を分離する。設定は後方互換かつ可能な限り原子的に保存する。
- デスクトップと主要モバイル幅を実表示で確認し、READMEには起動・設定・データ取得・費用条件・リリース履歴を残す。

詳細な状態遷移・コマンド・復旧手順は [`docs/exchange/AUTONOMOUS_HANDOFF.md`](docs/exchange/AUTONOMOUS_HANDOFF.md) が正本である。
