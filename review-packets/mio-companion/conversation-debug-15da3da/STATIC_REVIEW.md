# 指定7観点の静的確認

## 結論

Claude Codeの静的レビューで挙げられた修正1〜5をcommit `544793f` に反映した。自動テスト52件と
ビルドは合格したが、原因の確定およびiPhone実機での効果確認はしていない。

## コード上の事実

1. `playGeminiAudio()` に再生時間+2.5秒の監視を追加。端末音声には開始3秒と文字数依存の最大時間
   監視を追加した。終了処理は `settled` で一度だけ実行する。
2. `interrupted` を含む `state !== 'running'` でAudioContextを再開し、最大800ms待つ。再開後も
   runningでなければ端末音声へフォールバックする。実機でrunningになるかは未確認。
3. PCMはWAVへ包まず、`Int16Array`から `AudioBuffer` へ直接変換してWeb Audioで再生する。
   Web Audio経路としては再生可能な設計だが、実機では未確認。
4. Gemini Web Audioと端末音声の終了時刻を保存し、終了から350ms空けて聞き取りを再開する。
5. `listening || pendingListen` の防止は維持した。二重startが実機で起きないかは未確認。
6. SpeechRecognitionの0.9秒結果破棄は、ユーザー発話も捨てるため未実装。実機で段階(e)が出た場合
   のみ検討する。既存のhands-free文字入力向けエコー窓は維持した。
7. 状態遷移ログと25秒復旧を追加し、復旧後に届く古いGemini応答は連番で破棄する。モデル一覧は
   実行時にListModelsで取得し、候補を利用可能一覧に含まれるものへ制限する。
   `gemini-3.6-flash` は候補の1つだが、今回APIキーを使った実在確認とブラウザCORS確認は行っていない。
   現在の会話既定値は `gemini-3.5-flash`。
