# IBUKI STUDY BEAT 🎧

一歩一歩が、未来のステージをつくる。
伊吹さんの大学受験に向けた、学習計画・実績・振り返り記録アプリ(iPhone Safari優先のWebアプリ / PWA対応)。

## 使い方(公開)

GitHub Pagesで公開できます。リポジトリの Settings → Pages で
`main` ブランチ(root)を指定すると `https://<ユーザー名>.github.io/ibuki-study-beat/` で動きます。
iPhoneのSafariで開き、共有メニュー →「ホーム画面に追加」でアプリのように使えます。

## 画面構成(5画面)

| 画面 | 内容 |
|---|---|
| 今日 | スローガン(最大3件)、今日の予定、学習開始/終了タイマー、実績時間の修正、振り返り、キャラクター(名前変更可) |
| 記録 | 保存・編集・削除・削除取り消し・ごみ箱、後から記録、日本語IME変換中のEnter誤動作防止 |
| グラフ | **1日ごとに左=計画・右=実績の科目別積み上げ棒 + 同一グラフの第2軸に累積計画(緑)・累積実績(青)の折れ線**。日/週/月/全体、左右スワイプ、ピンチ拡大縮小、今日へ戻る、日の詳細、受験イベント(タップ詳細・長押し編集・公式URL)、Y軸単位表示、Y軸配置(左右分け/左寄せ) |
| コーチ | 発言を端末に保存し、端末内ロジックで返答(外部AI接続なし)。ポーズコレクション、名前変更 |
| 設定 | プロフィール、目標・スローガン、受験情報、科目(追加/色/表示/並び替え)、Y軸設定、データ書き出し/読み込み、全消去(二段階確認) |

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

## ファイル構成

```
index.html            アプリ本体(5画面)
css/app.css           黒×ゴールドのスタイル
js/calc.js            純粋計算ロジック(集計・累積・検証・サニタイズ) ※Node単体テスト対象
js/app.js             UI・グラフ描画・タッチ操作・保存
manifest.webmanifest  PWAマニフェスト
sw.js                 Service Worker(オフラインキャッシュ)
icons/                アプリアイコン
tests/unit/           単体テスト
tests/e2e/            受け入れ試験(Playwright)
```
