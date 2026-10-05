# Mio Call 双方向会話・公開レビュー資料

## 結論

正本 `mio-companion` の最新修正commit `40998de` から、双方向会話に必要なコードだけを
公開レビュー用に複製した。自動テスト55件と本番ビルドは合格している。実機では音声認識後に返事を
取得できない停止段階 `(b)` と、iPhoneで声が聞こえないことまで確認されたが、修正後の3往復は未確認であり、
双方向会話の完成を示す資料ではない。

## 出所

- 正本: 非公開リポジトリ `arumat-ken/mio-companion`
- 正本ブランチ: `antigravity/mio-gemini-tts`
- 修正前commit: `15da3da`
- 会話ループ修正commit: `544793f`
- 構造化JSON・安全なAPIエラー表示commit: `e43ac8b`
- iPhone音声解錠commit: `40998de`
- 引き継ぎ文書更新commit: `a98ad98`
- 公開先: `arumat-ken/ibuki-study-beat` のレビュー専用ブランチ
- 用途: Claude Codeによる反証レビュー。アプリの配布・実行用ではない。

APIキー、トークン、localStorageの値、個人情報、画像データは含めていない。
`conversation-loop-excerpt.js` にlocalStorageのキー名と読み書き処理は含まれるが、保存値は含まれない。

## 収録物

1. `CLAUDE_HANDOFF.md` — 正本と同一の引き継ぎ文書
2. `conversation-loop-excerpt.js` — 正本 `app/index.html` から機械抽出した会話ループ
3. `TEST_RESULTS.md` — 55テストの内訳と検査範囲
4. `DEVICE_TEST.md` — iPhone実機確認の有無と停止段階
5. `STATIC_REVIEW.md` — Claude依頼の7観点に対するコード上の事実
6. `manifest.json` — 出所とsha256

## 反映した防御処理

- Gemini Web Audioの再生終了イベントが来ない場合の強制終了
- 端末音声の開始待ち・最大時間監視
- `interrupted` を含むAudioContext再開待ちと端末音声へのフォールバック
- 再生終了から350ms空けたSpeechRecognition再開
- 状態遷移ログと、think/speakが25秒続いた場合の復旧
- 復旧後に遅れて届いたGemini応答の破棄
- 会話JSONを公式例の `responseMimeType`＋`responseSchema` へ変更
- HTTPステータスとAPIエラー先頭120文字の安全な画面表示
- 通話開始操作内でのWeb Audio解錠と、初回挨拶の端末音声再生

公式確認日: 2026-10-05（JST）。確認先:

- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- https://ai.google.dev/gemini-api/docs/generate-content/speech-generation

0.9秒以内のSpeechRecognition結果破棄と、無音SpeechSynthesisによる事前準備は、iPhone実機結果を
見てから判断するため未実装。

## Claude Codeへの依頼

- 実機、自動テスト、未確認を分ける。
- 推測を原因として断定しない。
- 修正案はこの公開コピーへの提案として示し、正本への反映はCodexへ戻す。
- 秘密情報を要求・追加しない。
- Mio Callの旧Claude版は代替試験に使わない。
