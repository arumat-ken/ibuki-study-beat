# 自動テスト結果

## 結論

2026-10-05に正本commit `15da3da` で `npm test` と `npm run build` を実行し、9ファイル・48件が
合格した。ただし、これらはコードと静的UIの検査であり、iPhoneのマイク、Safariの音声セッション、
実ネットワーク、実API音声再生の3往復を検査していない。

## 内訳

| テスト | 件数 | 主な検査 |
|---|---:|---|
| `handGestures.test.ts` | 17 | 8ポーズ資産、発話同期、検証、較正、フォールバック |
| `selfHostedVoice.test.ts` | 9 | SpeechRecognition構造、Gemini JSON、iPhone向けUI、TTS経路 |
| `geminiTts.test.ts` | 7 | 音声設定、感情、PCM/Web Audio、エコー対策、失敗時フォールバック |
| `cameraRig.test.ts` | 4 | 旧3D比較実装のカメラ制約 |
| `lipSync.test.ts` | 4 | 音量・口形の数値処理 |
| `settings.test.ts` | 3 | 既定値、範囲、移行 |
| `providers.test.ts` | 2 | プロバイダー定義 |
| `tailscaleAccess.test.ts` | 1 | Tailnetホスト制限 |
| `vectorAvatar.test.ts` | 1 | 旧ベクター比較実装の部品 |
| **合計** | **48** | |

## ビルド

`tsc -b && vite build` は成功した。出力は `dist/index.html`。ビルド成功はブラウザのマイク許可、
AudioContextの再開、CORS、Geminiモデルの実在、再生終了後の認識再開を保証しない。

