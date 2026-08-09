# AI連携フォルダ

CodexとClaude Codeが、Git worktreeとPull Requestで安全に引き継ぐための共有スペースです。**コード本文を人間がコピー&ペーストして引き渡す経路は廃止しました。**

| ファイル | 内容 |
|---|---|
| [`AUTONOMOUS_HANDOFF.md`](AUTONOMOUS_HANDOFF.md) | **現行の正本**。状態遷移、共有ロック、checkpoint、復旧、worktreeセットアップ |
| [`TASK_BOARD.md`](TASK_BOARD.md) | **現行タスク台帳の一覧**。状態はCLIで更新し、Gitにsnapshotする |
| [`tasks/`](tasks/) | **1タスク1ファイルの正本**。担当・checkpoint・引き渡し履歴を残す |
| [`PROTOCOL.md`](PROTOCOL.md) | **取り決め**。役割分担・ブランチ規則・受け渡し方法・守るべき境界 |
| [`STATUS.md`](STATUS.md) | **進行状況ボード**。今どこまで進んでいるか、何で止まっているか |
| [`REVIEW.md`](REVIEW.md) | ClaudeからCodex/GPTへの申し送り・レビュー結果(必要時に作成) |

## AIへ — このリポジトリで作業を始める前に

1. [`AUTONOMOUS_HANDOFF.md`](AUTONOMOUS_HANDOFF.md) と [`TASK_BOARD.md`](TASK_BOARD.md) を読み、対象タスクを確認する
2. `node scripts/ai-task.mjs audit` を実行し、対象が `ready` である場合だけclaimする
3. [`PROTOCOL.md`](PROTOCOL.md) で自分の担当範囲・ブランチ境界を確認する
4. [`../design/APP_CONTEXT.md`](../design/APP_CONTEXT.md) で既存アプリの仕様と**凍結仕様**を確認する
5. checkpointとsnapshotを残し、専用ブランチのPull Requestでhandoffする

## 各AIが読めるURL(公開リポジトリのため設定不要)

```
https://raw.githubusercontent.com/arumat-ken/ibuki-study-beat/main/docs/exchange/PROTOCOL.md
https://raw.githubusercontent.com/arumat-ken/ibuki-study-beat/main/docs/exchange/STATUS.md
https://raw.githubusercontent.com/arumat-ken/ibuki-study-beat/main/docs/design/APP_CONTEXT.md
https://raw.githubusercontent.com/arumat-ken/ibuki-study-beat/main/docs/design/FEATURE_SPEC_v4.md
```

## 権限の現実(2026年8月時点で確認済み)

| ツール | リポジトリの読み取り | 書き込み(コミット/PR) |
|---|---|---|
| **Claude Code** | ✅ | ✅ |
| **Codex**(ChatGPTデスクトップアプリ内) | ✅ | ✅ ※GitHub Appにwrite権限の付与が必要 |
| **ChatGPT のGitHubコネクタ** | ✅ | ❌ **構造的に不可**(読み取り専用) |
| Gemini など他のAI | ✅ 公開URLから読める | ❌ |

CodexとClaude Codeに書込み権限がある運用では、**人が成果物を運ばない**。権限がない環境では実装を開始せず、親が権限・実行環境を整える。
