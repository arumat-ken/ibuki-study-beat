# AI Task Board

> 状態は `scripts/ai-task.mjs` で更新し、節目ごとに `snapshot` してGitに残す。 ロックの強制解除は親だけが行える。

最終更新: 2026-08-09T01:37:53.363Z

| ID | Task | State | Owner | Handoff to | Updated |
| --- | --- | --- | --- | --- | --- |
| APP-410 | ver.4.1.0 ポイント・装備・ショップ | backlog | — | — | 2026-08-09T01:23:26.924Z |
| APP-420 | ver.4.2.0 金融ラボ・GT・PayPay交換申請 | backlog | — | — | 2026-08-09T01:23:26.932Z |
| OPS-001 | CodexとClaudeのローカル自律引き渡し経路 | review | — | claude | 2026-08-09T01:37:53.350Z |

## 運用ルール

- 基本遷移: `backlog → ready → claimed → in_progress → review → done`。
- Codex / Claude はそれぞれ同時に1件のみ（WIP上限1）。
- `APP-410` はClaudeの既存作業・コミットの親確認後、`APP-420` はAPP-410完了後にのみready化できる。
