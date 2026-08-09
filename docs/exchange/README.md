# AI連携フォルダ

複数のAI(Codex / Claude)と人間が、役割分担して開発するための共有スペースです。

| ファイル | 内容 |
|---|---|
| [`PROTOCOL.md`](PROTOCOL.md) | **取り決め**。役割分担・ブランチ規則・受け渡し方法・守るべき境界 |
| [`STATUS.md`](STATUS.md) | **進行状況ボード**。今どこまで進んでいるか、何で止まっているか |
| [`REVIEW.md`](REVIEW.md) | ClaudeからCodex/GPTへの申し送り・レビュー結果(必要時に作成) |
| [`../GLOSSARY.md`](../GLOSSARY.md) | **用語集**。略語・記号・役割・公開手順を一度で分かるように説明 |

## AIへ — このリポジトリで作業を始める前に

1. [`PROTOCOL.md`](PROTOCOL.md) を読み、自分の担当範囲とブランチを確認する
2. [`STATUS.md`](STATUS.md) で現在の状況を把握する
3. [`../GLOSSARY.md`](../GLOSSARY.md) で分からない略語・記号・作業の流れを確認する
4. [`../design/APP_CONTEXT.md`](../design/APP_CONTEXT.md) で既存アプリの仕様と**凍結仕様**を確認する
5. [`../design/FEATURE_SPEC_v4.md`](../design/FEATURE_SPEC_v4.md) で追加機能の確定設計を確認する
6. 作業後は `STATUS.md` を更新し、PRを作成するか `[handoff]` を付けてコミットする。新しい用語を使った場合は `../GLOSSARY.md` も更新する

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

**書き込みができないAIの成果物は、人が運ぶか、Claudeが代理でコミットします。**
