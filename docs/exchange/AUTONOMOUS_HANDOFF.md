# Codex × Claude Code 自律引き渡し

人間がコード本文をコピー&ペーストする経路は使わない。同じMacのGit worktreeとPull Requestを使い、台帳をGitに残してCodexとClaude Codeが安全に引き継ぐ。

## 正本と共有ロック

- **追跡する正本**: `docs/exchange/tasks/<ID>.md` と `docs/exchange/TASK_BOARD.md`。状態、担当、チェックポイント、引き渡し履歴はGitコミットで追跡する。
- **即時同期するロック**: `git rev-parse --git-common-dir` 配下の `ai-handoff/locks/`。linked worktreeの共通Git管理領域なので、Codex/Claudeが別worktreeでも同じロックを見る。ロックは短命の排他制御であり、履歴の正本ではない。
- **親**だけが `recover` / `unlock` を使える。`audit` は警告するだけで、4時間放置されても自動横取りしない。

この仕組みを初めて追加する際だけ、`init → ready → claim` を実行できる最小CLIを先に置くブートストラップを許可する。その後は通常のclaim規則を例外なく適用する。OPS-001はこのブートストラップ記録を持つ最初のタスクである。

## 初回セットアップ

基準checkoutで一度だけ実行する。既存のworktreeやブランチはリセット・削除しない。再実行は検証のみになり安全である。

```bash
node scripts/setup-ai-worktrees.mjs --repo "$(git rev-parse --show-toplevel)" --base main
```

標準では元checkoutと同じ親フォルダに `<repo>-codex`（`codex/workspace`）と `<repo>-claude`（`claude/workspace`）を作る。作業ごとに各worktreeで `codex/<task>` / `claude/<task>` の専用ブランチへ切り替え、mainへ直接pushしない。

## 状態とWIP

基本遷移は次の通り。

```text
backlog → ready → claimed → in_progress → review → done
```

- 新規依頼は必ず `backlog` で登録する。
- `ready` は親だけが設定する。
- Codex/Claudeはそれぞれ同時に**1タスクだけ**claimできる。claim成功前の実装は禁止。
- `checkpoint` は `claimed` を `in_progress` に進める。
- `handoff` は、変更がコミット済み・作業ツリーがclean・チェックポイントがある場合だけ `review` に進め、送る側のWIPロックを解放する。受け手が修正を始めるならreviewからclaimする。
- `done` はreviewの担当者または親が、cleanなコミット済み状態で設定する。
- `block` はチェックポイントを残してから行う。`recover` は親だけが `blocked` または4時間以上停滞したタスクを `ready` に戻す。

## コマンド早見表

すべてのコマンドはworktreeのルートで実行する。必要なら `--repo /absolute/path` を付ける。

```bash
node scripts/ai-task.mjs init
node scripts/ai-task.mjs list
node scripts/ai-task.mjs show OPS-001
node scripts/ai-task.mjs new OPS-999 --actor parent --title "新しい依頼"
node scripts/ai-task.mjs ready OPS-999 --actor parent
node scripts/ai-task.mjs claim OPS-999 --actor codex
node scripts/ai-task.mjs checkpoint OPS-999 --actor codex \
  --completed "完了内容" --remaining "残作業" --next "次に実行する正確なコマンド" \
  --files "変更ファイル" --tests "テスト結果"
node scripts/ai-task.mjs snapshot
node scripts/ai-task.mjs handoff OPS-999 --actor codex --to claude
node scripts/ai-task.mjs block OPS-999 --actor codex --reason "親の仕様判断待ち"
node scripts/ai-task.mjs done OPS-999 --actor claude
node scripts/ai-task.mjs recover OPS-999 --actor parent
node scripts/ai-task.mjs unlock OPS-999 --actor parent --reason "監査で確認した孤立ロック" --force
node scripts/ai-task.mjs audit
```

`APP-410` は親がClaudeの既存作業・コミットを照合し、証跡を `ready --confirm "..."` に記録するまでbacklogである。`APP-420` はAPP-410がdoneになるまでready化できない。

## チェックポイントとスナップショット

token不足・中断・引き渡しの前には必ず `checkpoint` を残す。各チェックポイントには次をすべて書く。

1. 完了内容
2. 残作業
3. 次の正確な操作
4. 変更ファイル
5. テスト結果
6. ブランチ
7. コミット

チェックポイント後と状態遷移後は、必ず `snapshot` を実行する。これは `docs/exchange/tasks/` と `TASK_BOARD.md` **だけ**を明示的にコミットし、他のステージ済み変更があれば停止する。チェックポイント後の台帳コミットは、引き渡す実装コミットの後に積まれてよい。

## 監査・異常復旧

`audit` は次を確認する。

- 担当ごとのWIPが1以下か
- 台帳のactiveタスクと共通ロックが一致するか
- 4時間以上チェックポイントがないactiveタスク
- 孤立・破損した共有ロック

警告が出ても自動回収はしない。親は状況を確認してから `recover`（台帳もreadyへ復旧）または `unlock`（activeでないタスクの孤立ロックだけ除去）を行う。`unlock` は新しいロックを消さないよう4時間未満では `--force` を必要とする。

## Pull Request

作業者は本番変更と台帳スナップショットを専用ブランチへコミットし、テスト後にpushする。PR本文には変更内容、理由、利用者への影響、確認コマンドを記載する。PR作成後は `handoff <ID> --to <相手>` と `snapshot` を行い、レビュー待ちをGitに残す。
