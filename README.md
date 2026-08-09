# IBUKI STUDY BEAT 🎧

一歩一歩が、未来のステージをつくる。
伊吹さんの大学受験に向けた、学習計画・実績・振り返り記録アプリ(iPhone Safari優先のWebアプリ / PWA対応)。

## 使い方(公開)

GitHub Pagesで公開できます。リポジトリの Settings → Pages で
`main` ブランチ(root)を指定すると `https://<ユーザー名>.github.io/ibuki-study-beat/` で動きます。
iPhoneのSafariで開き、共有メニュー →「ホーム画面に追加」でアプリのように使えます。

## 画面構成(6画面)

| 画面 | 内容 |
|---|---|
| 今日 | スローガン(最大3件)、今日の予定、学習開始/終了タイマー、実績時間の修正、振り返り、キャラクター(名前変更可) |
| 記録 | 保存・編集・削除・削除取り消し・ごみ箱、後から記録、日本語IME変換中のEnter誤動作防止 |
| グラフ | **1日ごとに左=計画・右=実績の科目別積み上げ棒 + 同一グラフの第2軸に累積計画(緑)・累積実績(青)の折れ線**。日/週/月/全体、左右スワイプ、ピンチ拡大縮小、今日へ戻る、日の詳細、受験イベント(タップ詳細・長押し編集・公式URL)、Y軸単位表示、Y軸配置(左右分け/左寄せ) |
| 世界 | 時事ニュースを自分の言葉で記録(ジャンル・見出し・一言、1日3本まで)。アプリはニュース本文を取得・保存しない。志望学部に一致するジャンルはポイント1.5倍。記録すると自動で「🤖 AIに聞く」が開き、背景・小論文の論点・賛否を質問できる |
| コーチ | 発言を端末に保存し、端末内ロジックで返答。**「🤖 AIに聞く」でiPhoneのAIアプリ(ChatGPT/Claude/Gemini/Copilot/Perplexity/任意)に質問を引き渡し、操作方法も学習相談もできる**。ポーズコレクション、名前変更 |
| 設定 | プロフィール、目標・スローガン、受験情報、志望学部(経済/法/国際を複数選択)、科目(追加/色/表示/並び替え)、**AI連携設定**、Y軸設定、データ書き出し/読み込み、全消去(二段階確認) |

## アップデートの反映(公開手順)

`main` ブランチにプッシュすると、GitHub Pagesが約1分で自動配信します。伊吹さん側の操作は不要です。

**リリース時に必ず上げる2か所(ここを忘れると新版が届きません):**

| ファイル | 変数 | 例 |
|---|---|---|
| `js/app.js` | `APP_VERSION` | `'4.0.0'` |
| `sw.js` | `CACHE` | `'isb-v4.0.0'` |

**絶対に変えないもの:** `js/app.js` の保存キー `ibukiStudyBeat.v3`。ここを変えると過去の学習記録が読めなくなります。

**利用者側の見え方:**

1. アプリを開く(または前面に戻す)と新版を自動で確認します
2. 新版があれば画面中央に「新しいバージョンがあるよ！」と表示 → タップで更新して自動的に再読み込み
3. 更新後の初回起動時に、画面中央で「アプリが新しくなったよ！ ver. A → B」とお知らせ
4. 学習記録・設定はすべて保持されます(`schemaVersion` による自動移行、破損時は自動バックアップから復元)

## AI連携について

コーチ画面と世界画面(ニュース記録後)の「🤖 AIに聞く」は、**質問文をクリップボードにコピーし、選んだAIアプリを開く**方式です(iOSではWebアプリから他アプリのAIを直接呼べないため)。世界画面ではニュースの見出しと志望学部を踏まえた、背景・小論文の論点・賛否を問う質問文を自動生成します。

- 使うAIアプリは 設定 → AI連携設定 で選択(ChatGPT / Claude / Gemini / Copilot / Perplexity / コピーのみ / カスタムURL)
- 「使い方」系の質問には `js/manual.js` の操作マニュアルを自動で添えるため、AIがこのアプリの操作方法に答えられる
- 学習状況(今日の時間・連続日数・累計・受験日など)を添えるかは設定でON/OFF
- **アプリが自動でAIと通信することはない**。送信するかどうかはAIアプリ側で利用者が決める

アプリの機能を変更したら `js/manual.js` の内容も更新すること。

## データについて

- 保存先はこの端末のブラウザ内(localStorage)のみ。`schemaVersion` 付き。
- 毎日自動バックアップを別キーに保存。保存データが壊れていた場合は**消去せず退避**し、自動バックアップから復元します。
- 設定 → データ管理からJSONの書き出し/読み込みができます(機種変更時はこれを使用)。
- 旧パイロット版(`ibuki_beat_state`)の学習ログは初回起動時に自動で引き継ぎます。

## 開発

依存パッケージなし(素のHTML/CSS/JS)。グラフも自前SVG描画です。

```bash
# 単体テスト(グラフ計算・検証・データ保護ロジック)
node --test tests/unit/calc.test.mjs

# 受け入れ試験(E2E; ACCEPTANCE_TESTS.md準拠 / 要 playwright + chromium)
npx http-server -p 8787 -s &
node tests/e2e/acceptance.mjs
```

- 試験結果: [TEST_RESULTS.md](TEST_RESULTS.md)
- 画面スクリーンショット: [docs/screenshots/](docs/screenshots/)

### Codex × Claude Code の引き渡し

AI間でコード本文をコピー&ペーストしません。ローカルの共有Git管理領域にWIPロックを置き、状態・checkpoint・引き渡し履歴はGit追跡の台帳に残します。

```bash
# 初回のみ: 同じMacに安全なCodex/Claude用worktreeを用意（再実行は検証のみ）
node scripts/setup-ai-worktrees.mjs --repo "$(git rev-parse --show-toplevel)" --base main

# 作業開始前の確認
node scripts/ai-task.mjs audit
node scripts/ai-task.mjs list
```

詳しい状態遷移と復旧手順は [docs/exchange/AUTONOMOUS_HANDOFF.md](docs/exchange/AUTONOMOUS_HANDOFF.md) を参照してください。

## ファイル構成

```
index.html            アプリ本体(6画面)
css/app.css           黒×ゴールドのスタイル
js/calc.js            純粋計算ロジック(集計・累積・検証・サニタイズ) ※Node単体テスト対象
js/app.js             UI・グラフ描画・タッチ操作・保存
manifest.webmanifest  PWAマニフェスト
sw.js                 Service Worker(オフラインキャッシュ)
icons/                アプリアイコン
tests/unit/           単体テスト
tests/e2e/            受け入れ試験(Playwright)
```
