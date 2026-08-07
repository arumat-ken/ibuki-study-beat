# 現行アプリ仕様 — IBUKI STUDY BEAT ver. 3.3.0

GUI設計の前提として読む資料。**ここに書かれた既存仕様は変更しない。**

- 公開URL: https://arumat-ken.github.io/ibuki-study-beat/
- リポジトリ: https://github.com/arumat-ken/ibuki-study-beat
- 利用者: 大学受験生の男子高校生1名(志望: 経済学部・法学部・国際学部)
- 受験予定: 私立大学の公募推薦(10月・11月)、共通テスト、一般選抜
- 端末: iPhone Safari。ホーム画面に追加してPWAとして全画面利用

## 技術的な前提

| 項目 | 内容 |
|---|---|
| 構成 | 素のHTML/CSS/JS。フレームワーク・ビルド・依存パッケージなし |
| ファイル | `index.html` / `css/app.css` / `js/calc.js` / `js/manual.js` / `js/app.js` / `sw.js` |
| 外部通信 | **ゼロ**。`fetch`/XHR/WebSocketをアプリ本体に一切持たない |
| データ保存 | localStorage のみ(キー `ibukiStudyBeat.v3`)。端末外に出ない |
| グラフ | 自前のSVG描画。ライブラリ不使用 |
| オフライン | Service Workerで全アセットをキャッシュ。圏外でも起動する |
| 最小幅 | **320px でレイアウトが崩れないこと** |
| タップ領域 | 原則 **44×44px 以上** |
| モーション | `prefers-reduced-motion` に対応 |

## デザイントークン(CSS変数・そのまま使用すること)

```css
--bg:          #0b0b10;   /* 画面背景 */
--surface:     #14141c;   /* モーダル背景 */
--card:        #1a1a24;   /* カード */
--card-2:      #20202c;   /* カード内要素・入力欄 */
--gold:        #d9b24a;   /* ゴールド */
--gold-bright: #f0c75e;   /* 明るいゴールド(見出し・強調) */
--gold-dim:    rgba(217,178,74,0.35);  /* ゴールドの枠線 */
--text:        #f2efe6;   /* 本文 */
--dim:         #9c99a6;   /* 補助テキスト */
--line:        rgba(255,255,255,0.09); /* 境界線 */
--panel:       #f5f2ea;   /* グラフの明色パネル(グラフだけ白背景) */
--panel-text:  #23221e;
--panel-dim:   #6d6a60;
--danger:      #e0564f;
--ok:          #58b368;
--plan-line:   #3baa5c;   /* 累積計画の折れ線(緑) */
--actual-line: #3b82f6;   /* 累積実績の折れ線(青) */
--nav-h:       58px;      /* 下部ナビの高さ */
```

**科目色**: 英語 `#4A90D9` / 数学 `#58B368` / 国語 `#F5A623` / 理科 `#9B59B6` / 社会 `#E8604C` / その他 `#9AA0A6`

**フォント**: `-apple-system, BlinkMacSystemFont, 'Hiragino Sans', ...`(システムフォント)
**入力欄のfont-size**: `16px` 固定(iOSの自動ズーム防止のため。変更不可)

## 既存の共通コンポーネント

| クラス | 用途 |
|---|---|
| `.card` | 角丸16px・`--card`背景・`--line`枠のカード。基本の箱 |
| `.card h2` | カード見出し。`--gold`・0.8rem・letter-spacing 0.12em |
| `.btn` | 標準ボタン(min-height 44px・角丸12px) |
| `.btn.primary` | ゴールドのグラデーション主要ボタン(黒文字) |
| `.btn.big` | 大ボタン(min-height 54px) |
| `.btn.block` | 幅100% |
| `.btn.danger` | 赤系 |
| `.modal-back` / `.modal` | **下から出るボトムシート型モーダル**。角丸18px上部のみ・最大高88dvh |
| `.toast` | 画面下部のトースト。「元に戻す」等のアクション付きも可 |
| `.center-msg` | **画面中央のお知らせ**(更新通知等) |
| `.celebrate` | 全画面のお祝い演出(キャラ画像+メッセージ) |
| `.toggle` | ON/OFFスイッチ(46×28px・ONでゴールド) |
| `.quick-chip` | 角丸22pxのチップ型ボタン(ゴールド枠) |
| `.stat-chip` | グラフ上部の統計チップ(横スクロール) |
| `.nav` / `.nav-btn` | 下部固定ナビ。SVGアイコン+ラベル。activeはゴールド |

**情報の階層化は「カード + ボトムシート型モーダル」で行うのが本アプリの流儀。**
1画面に詰め込まず、カードをタップしてモーダルで詳細、という構造を守ること。

## 現在の5画面

### ① 今日(ホーム)
- 上部: ブランド名「IBUKI STUDY BEAT」+ バージョン表示、キャラ名変更ボタン
- キャラのヒーローカード(立ち姿 + 吹き出しで今の状況に応じた声かけ)
- 今日のスローガン(タップで最大3件を切替)
- 学習中はタイマーカード(経過時間・一時停止・終了・記録せずやめる)
- 今日の予定リスト(科目色のドット + 内容 + 計画時間 / 完了は✓と実績時間)
- 「＋ 予定を追加」
- **「学習を開始する ▶」大ボタン(ゴールド・この画面の主役)**
- 今日の積み上げ(合計時間・目標・進捗バー・連続日数・今週合計・受験日まで)

### ② 記録
- 記録フォーム(日付/科目/内容/学習種別/計画分/実績分/[テスト時]得点・満点/振り返り)
- 「記録を保存する ✓」
- これまでの記録一覧(日付ごとにグループ化、✏️編集・🗑削除)
- 右上にごみ箱(削除済みの復元・完全削除)

### ③ グラフ(学習タイムライン)【このアプリの中核・仕様変更不可】
- 期間タブ: 日 / 週 / 月 / 全体
- 統計チップ: 計画合計・実績合計・達成率・累積計画・累積実績(横スクロール)
- **グラフ本体(明色パネル)**:
  - 1日ごとに **左=計画(薄色・opacity 0.42)、右=実績(濃色)** の2本を並べる
  - 各棒は **科目色の積み上げ**
  - **同一グラフの第2軸(右)** に 累積計画(緑線)・累積実績(青線)の折れ線
  - 「今日」の位置に破線マーカー
  - 受験イベントは未来側に◆マーカー
- 操作: 左右スワイプで期間移動 / ピンチで拡大縮小 / 棒タップで日別詳細 / 「📍今日へ戻る」
- ⚙️ または長押しで軸設定(単位 時間・分 / Y軸配置 左右分け・左寄せ / 最大値の自動調整 / 0ライン)
- 下部に「今後のイベント」一覧(タップで詳細、長押しで編集、公式URLへのリンク)

### ④ コーチ(BEATスター)
- スポットライトのステージにキャラ表示 + 名前 + 現在のポーズ名
- 状況に応じた声かけの吹き出し
- 3ボタン: 「ポーズ変更」「メッセージ」「名前変更」
- ポーズコレクション(9種・実績で解放。未解放は🔒と条件を表示)
- メッセージ(端末内の定型返答) + 「🤖 ○○に聞く」でiPhoneのAIアプリへ質問を引き渡し
- クイック質問チップ(使い方を教えて / グラフの見方 / 記録の直し方 / 勉強の相談)

### ⑤ 設定
プロフィール / 目標・スローガン / 受験情報 / 科目設定 / AI連携設定 / グラフ・Y軸設定 /
データ管理(JSON書出・読込・自動バックアップ復元・全消去) / サポート・ヘルプ

## キャラクター画像(`assets/char/` に実在。使い回すこと)

| ファイル | 用途 | 実寸 |
|---|---|---|
| `coach_stage.png` | 立ち姿(今日画面・コーチ画面) | 160×233 |
| `pose_smooth_criminal.png` 他 全9種 | ポーズコレクション | 各 112×139 |
| `cele_nicebeat.png` 他 全6種 | お祝い演出 | 各 約170×201 |

ポーズ9種: smooth_criminal / moonwalk / thriller / billie_jean / heel_toe /
zero_gravity / spin_turn / windmill / end_pose
演出6種: nicebeat / streak7 / hours20 / goal / exam_done / gokaku

## データ構造(localStorage キー `ibukiStudyBeat.v3`)

```javascript
{
  schemaVersion: 3,
  createdAt: "2026-08-05",
  settings: {
    characterName, userName, slogans[], dailyGoalMin, examDate,
    ai: { appId, customUrl, sendStats },
    axis: { placement, unit, barMax, lineMax, showZeroLine, autoRange },
    subjects: [{ id, name, color, visible }]
  },
  records: [{ id, date, subjectId, content, kind, planMin, actualMin,
              score, maxScore, reflection, createdAt, updatedAt, deletedAt }],
  events:  [{ id, date, title, faculty, method, url, memo }],
  coach:   { members[], messages[] },
  activeSession, poseUnlocks[], seq
}
```

**変更してはいけないもの**: 保存キー名 `ibukiStudyBeat.v3` / `schemaVersion` が数値であること /
既定科目のID(`eng` `math` `jpn` `sci` `soc` `other`)/ `records[]` の必須フィールド。
**新フィールドの追加は安全**(既存データには既定値が自動補完される)。

## 凍結仕様(変更しないこと)

1. グラフ画面の構造(左=計画・右=実績の科目別積み上げ棒 + 第2軸の累積折れ線)
2. 黒×ゴールドの世界観、LEGOミニフィグ風キャラクター
3. 外部と通信しない設計
4. 異常データを検出しても自動初期化しない。全消去は二段階確認
5. 未実装のボタンを置かない
6. コーチの返答が「AIに接続済み」だと誤認させる表示をしない
