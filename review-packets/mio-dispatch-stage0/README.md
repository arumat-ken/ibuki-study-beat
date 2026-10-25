# 澪 × Claude Dispatch 段階0 公開レビュー資料

結論: Claude Dispatchへの直接API／固定ファイル経路は確認できなかったため、段階1は手動の貼付・
ファイル選択から開始する設計です。連携は既定オフ、許可リスト外は破棄、ローカルで伏せ字・3文要約を
行い、書き戻しはKenさんの明示確認後だけ行います。

## 正本

- repository: `arumat-ken/mio-companion`
- base: `antigravity/mio-gemini-tts` / `f6e6da6`
- branch: `codex/mio-dispatch-stage0`
- commit: `33505ed87ec3efb2f1098b4a33a9d1954edefdf6`
- source document: `docs/DISPATCH_MIO_STAGE0_DESIGN.md`

## このPRの範囲

- 調査結果と未確認事項の分離
- Dispatch → 澪 → Ken → Dispatch の入出力表と図
- 外部送信を防ぐ許可リスト、伏せ字、確認状態機械
- 段階1〜3の設計と検証計画

実装コードは含みません。APIキー、トークン、個人情報、Dispatch原文、`localStorage` の値も含みません。

