# 指定7観点の静的確認

## 結論

再生終了後のコールバック自体は存在する。一方、Gemini TTS（Web Audio）終了後の350ms待機と、
SpeechRecognition経路へ適用される0.9秒のエコー破棄はコード上で確認できない。これは原因の確定
ではなく、iPhone実機で優先確認すべき差分である。

## コード上の事実

1. `playGeminiAudio()` は `source.onended = settle` を設定し、`settle()` が `speaking=false`、
   `setState('idle')`、`done()` を実行する。`speechSynthesis`側も `onend` と `onerror` を同じ
   `settle()`へ接続している。
2. 通話開始ボタン内で `speak()` が呼ばれ、`speak()` は非同期取得前に `getAudioContext()` を呼ぶ。
   ただし、実機でAudioContextが確実に `running` になるかは未確認。
3. PCMはWAVへ包まず、`Int16Array`から `AudioBuffer` へ直接変換してWeb Audioで再生する。
   Web Audio経路としては再生可能な設計だが、実機では未確認。
4. 音声認識は最終結果後の `rec.onend` から返答生成へ進むため、通常の音声入力経路では再生前に
   認識が終了している。再生終了後、`ask()` の完了コールバックは `beginListen()` を呼ぶ。
   `beginListen()` の350ms待機条件は `speechSynthesis.speaking` だけで、Web AudioのGemini TTS
   終了後は通常0msとなる。
5. `beginListen()` は `listening || pendingListen` を防止する。ただし `pendingListen` は
   `startListening()` 呼び出し直前にfalseへ戻り、`listening` は `rec.onstart` でtrueになるため、
   その間の二重要求を静的テストだけでは完全に排除できない。
6. `closeEchoWindow()` は終了時に `echoUntil = now + 900` を設定するが、`echoWindow()` の利用先は
   hands-free文字入力経路である。公開抜粋内のSpeechRecognition `onresult` には同等の破棄条件がない。
   再生開始時にエコー窓を開く処理も確認できない。
7. モデル一覧は実行時にListModelsで取得し、候補を利用可能一覧に含まれるものへ制限する。
   `gemini-3.6-flash` は候補の1つだが、今回APIキーを使った実在確認とブラウザCORS確認は行っていない。
   現在の会話既定値は `gemini-3.5-flash`。

