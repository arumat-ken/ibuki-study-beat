# Mio Call 双方向会話・公開レビュー資料

## 結論

正本 `mio-companion` の commit `15da3da` から、双方向会話に必要なコードだけを公開レビュー用に
複製した。自動テスト48件と本番ビルドは合格しているが、iPhone Safariで「マイク許可後、
画面に触れず3往復」の実機確認記録はない。したがって、停止段階 `(a)`〜`(e)` は未判定であり、
双方向会話の完成を示す資料ではない。

## 出所

- 正本: 非公開リポジトリ `arumat-ken/mio-companion`
- 正本ブランチ: `antigravity/mio-gemini-tts`
- 正本commit: `15da3da`
- 公開先: `arumat-ken/ibuki-study-beat` のレビュー専用ブランチ
- 用途: Claude Codeによる反証レビュー。アプリの配布・実行用ではない。

APIキー、トークン、localStorageの値、個人情報、画像データは含めていない。
`conversation-loop-excerpt.js` にlocalStorageのキー名と読み書き処理は含まれるが、保存値は含まれない。

## 収録物

1. `CLAUDE_HANDOFF.md` — 正本と同一の引き継ぎ文書
2. `conversation-loop-excerpt.js` — 正本 `app/index.html` から機械抽出した会話ループ
3. `TEST_RESULTS.md` — 48テストの内訳と検査範囲
4. `DEVICE_TEST.md` — iPhone実機確認の有無と停止段階
5. `STATIC_REVIEW.md` — Claude依頼の7観点に対するコード上の事実
6. `manifest.json` — 出所とsha256

## Claude Codeへの依頼

- 実機、自動テスト、未確認を分ける。
- 推測を原因として断定しない。
- 修正案はこの公開コピーへの提案として示し、正本への反映はCodexへ戻す。
- 秘密情報を要求・追加しない。
- Mio Callの旧Claude版は代替試験に使わない。

