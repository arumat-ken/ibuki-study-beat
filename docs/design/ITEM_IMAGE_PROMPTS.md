# ショップアイテムの画像生成プロンプト集

作成: 2026-08-09 / 最終更新: 2026-08-10 / 作成者: Claude Code
対象: ver.4.1.0 のショップ・装備アイテム 全19点(衣装5・スキル5・ステージ5・消費4)
関連: Issue #3 (APP-430)

現在アイテムは**テキストのみ**で表示されている。ここに1点ずつアイコン画像を添えるための
生成プロンプトをまとめた。

---

## ⚠️ 自動生成パイプラインを使う場合はJSONを読むこと

**機械可読の正本は [`item_image_prompts.json`](item_image_prompts.json) です。**
Gemini APIを呼ぶスクリプトは、このMarkdownではなくJSONを参照してください。

```
docs/design/item_image_prompts.json   ← スクリプトはこちらを読む(正本)
docs/design/ITEM_IMAGE_PROMPTS.md     ← 人間が読む用(このファイル)
```

JSONの使い方:

```
final_prompt = common.stylePrefix + " " + item.prompt + " NEGATIVE: " + common.negative
出力先        = outputDir + "/" + item.file      (= assets/items/<id>.png)
```

- `item.status` が `"generated"` のものは生成済み。`"pending"` だけ処理すればよい
- プロンプトを変えたときは `promptVersion` を上げること(再生成の判定に使える)
- **`item.id` はアプリ内部のアイテムIDと一対一で対応している。IDとファイル名は変更しないこと**

### 安全フィルタ対策(promptVersion 2 で適用済み)

画像生成AIのセーフティフィルタでブロックされるのを避けるため、**特定の実在人物を
連想させる固有名詞(ダンスの技名・帽子の型名など)をプロンプト本文から完全に削除**した。
アプリ内のアイテム名は変えていない。画像は「後ろ向きに続く足跡」「つば付きの黒い帽子」
として描かれるだけで、アプリ上での意味は通じる。

あわせて、人物・顔・手を明示的に禁止する `NEGATIVE` 指定を全点共通に入れている。
以下2〜5章の日本語プロンプトは人間向けの説明であり、**実際に生成AIへ渡すのはJSONの
`prompt`(英語・安全化済み)**である。

---

## 0. 使い方(手作業で1点ずつ作る場合)

1. 下の「共通スタイル指定」をコピーする
2. 作りたいアイテムの「個別プロンプト」をその後ろにつなげる
3. 画像生成AIに投げる
4. できた画像を `assets/items/<id>.png` として保存する(idは各項目に明記)

英語プロンプトを併記している。**多くの画像生成AIは英語の方が指示が正確に通る**ため、
うまくいかないときは英語版を試すこと。

---

## 1. 共通スタイル指定(全アイテム共通・必ず先頭につける)

```
黒(#0b0b10)を背景にした、ゴールド(#d9b24a〜#f0c75e)を主役にしたアイコンイラスト。
正方形1:1、512×512px。中央に被写体を1つだけ大きく配置し、余白を均等にとる。
背景は黒一色または黒〜濃紺のごく浅いグラデーションのみ。文字・ロゴ・透かしは入れない。
質感は上質でつやのある金属光沢。淡いゴールドのグロー(発光)を被写体のふちに添える。
高校生が使う学習アプリのアイコンなので、派手すぎず、品よく、ひと目で何かが分かる形にする。
写実的すぎない、少しだけデフォルメしたスタイリッシュなイラスト。
```

**English (recommended):**
```
Icon illustration on a pure black (#0b0b10) background, with gold (#d9b24a to #f0c75e)
as the dominant color. Square 1:1, 512x512px. A single subject centered and large,
with even margins. Background is solid black or a very subtle black-to-deep-navy gradient
only. No text, no logos, no watermarks. Premium glossy metallic finish with a soft golden
rim glow. Stylish, slightly stylized illustration (not photorealistic). Tasteful and
readable at small sizes — this is an app icon for a high school student's study app.
```

### 重要な注意(必ず守ること)

- **実在の人物に似せない。** これらのアイテムは往年のポップスターを連想させる名前だが、
  **人物ではなく「モノ」「情景」だけを描く**こと。人物の顔・全身は入れない
  (人物を描くと肖像の問題が出るうえ、アイコンとしても小さく見えにくい)。
- ダンスの技名(ムーンウォーク等)は、**足跡・軌跡・シルエットの一部・光の線**など
  抽象的な表現に置き換える。
- 既存のキャラクター画像(`assets/char/`)とは**別物**として作る。並べたときに
  「アイテム欄のアイコン」だと分かるトーンに揃える。

---

## 2. 👕 衣装(コスチューム)5点

倍率が常に上がる装備。**身につけるモノそのもの**を、宙に浮かせて撮ったように描く。

### 2-1. 白いソックス — `assets/items/socks.png`

```
真っ白な光沢のあるソックス(靴下)が一足、宙に浮いている。
黒背景に白が映え、ふちにうっすらゴールドの光。清潔感と「ここから始まる」感じ。
```
**EN:** `A pair of crisp white glossy socks floating in mid-air, black background, subtle gold rim light, clean and fresh, the humble first step.`

### 2-2. スパンコールのグローブ — `assets/items/gloves.png`

```
無数のスパンコール(スパングル)で覆われた片手用グローブが1つ、宙に浮いている。
スパンコールが黒背景の中でゴールドと白にきらめき、細かい光の粒が散る。
```
**EN:** `A single sequined glove covered in countless tiny sparkling spangles, floating in mid-air, glittering gold and white against black, scattered light particles.`

### 2-3. フェドーラハット — `assets/items/fedora.png`

```
黒いフェドーラハット(つば付きの帽子)が1つ、少し傾いて宙に浮いている。
リボン部分がゴールド。つばのふちに沿ってゴールドの光が走る。
```
**EN:** `A black fedora hat tilted at a jaunty angle, floating in mid-air, with a gold hatband and a gold light tracing the brim, against a black background.`

### 2-4. ゴールドベルト — `assets/items/belt.png`

```
大きなゴールドのバックルがついたベルトが1本、ゆるやかにカーブして宙に浮いている。
バックルが強く輝き、チャンピオンベルトのような風格。
```
**EN:** `A belt with a large ornate gold buckle, curving gracefully in mid-air, the buckle gleaming brightly like a championship belt, black background.`

### 2-5. ライトアップジャケット — `assets/items/jacket.png`

```
黒いジャケットが1着、宙に浮いている。縫い目と襟に沿ってゴールドのLEDライトが
一本の線のように光り、ジャケット全体を発光させている。最上位装備らしい存在感。
```
**EN:** `A black jacket floating in mid-air, with glowing gold LED light strips running along its seams and collar, illuminating the whole garment. The most powerful item in the set — commanding presence. Black background.`

---

## 3. 💫 スキル 5点

条件を満たしたときだけ効く特殊能力。**動きや現象を抽象的に**描く。人物は描かない。

### 3-1. リズムキープ — `assets/items/rhythm_keep.png`

```
一定間隔で並ぶゴールドの音波・ビートの波形が、規則正しく脈打っている。
メトロノームの振り子をゴールドで抽象化した形を中央に置いてもよい。
「途切れずに続く」ことを感じさせる、規則的で安定した構図。
```
**EN:** `Evenly spaced golden sound waves / beat pulses in a steady rhythm, optionally with an abstract golden metronome pendulum at the center. Regular, stable composition conveying unbroken continuity. Black background.`

### 3-2. ムーンウォーク — `assets/items/moonwalk.png`

```
ゴールドに光る足跡が、右から左へ後ろ向きに続いている。
足跡は奥に行くほど淡くなり、床にうっすら月明かりのような反射。
人物は描かず、足跡と光の軌跡だけ。
```
**EN:** `A trail of glowing gold footprints moving backwards from right to left, fading into the distance, with a soft moonlight-like reflection on the floor. Only footprints and light trails — no person. Black background.`

### 3-3. スピンターン — `assets/items/spin_turn.png`

```
ゴールドの光の輪が高速回転して残像を描いている。渦を巻くような螺旋の軌跡。
中心に向かって光が収束し、勢いと切れ味を感じさせる。
```
**EN:** `Golden light rings spinning at high speed leaving motion-blur afterimages, forming a spiral vortex converging toward the center. Sharp, energetic sense of rotation. Black background.`

### 3-4. ゼロ・グラビティ — `assets/items/zero_gravity.png`

```
斜めに傾いたゴールドの光の柱が、重力に逆らって静止している。
まわりに小さな粒子がふわりと浮遊。「傾いたまま倒れない」不思議さを表現。
```
**EN:** `A tilted golden pillar of light frozen in an impossible lean, defying gravity, with small particles floating weightlessly around it. Conveys the mystery of leaning without falling. Black background.`

### 3-5. アンチグラビティ・リーン — `assets/items/anti_gravity_lean.png`

```
夜明けの空をイメージした、黒から淡いゴールドへのグラデーション。
中央に、地面から斜めに伸びる光の線と、昇りはじめた太陽の淡い光。
「早起きして机に向かう朝」の静かな高揚感。
```
**EN:** `A dawn sky gradient from black to pale gold. A beam of light rising diagonally from the ground, with the soft glow of a just-rising sun. Quiet exhilaration of an early morning study session.`

---

## 4. 🎤 ステージ 5点

背景が豪華になる装備。**会場そのもの**を、無人の状態で描く。観客の顔は描かない。

### 4-1. ストリート(初期装備・無料) — `assets/items/street.png`

```
夜の街角。ひび割れたアスファルトに街灯のゴールドの光がひとつ落ちている。
段ボールや簡素なラジカセが端に置かれ、素朴で「ここから始まる」雰囲気。人は描かない。
```
**EN:** `A night street corner, cracked asphalt lit by a single golden streetlamp, a simple boombox at the edge. Humble, the starting point. No people. Black background.`

### 4-2. ライブハウス — `assets/items/live_house.png`

```
小さなライブハウスの内観。低い天井、狭いステージ、数本のスポットライトがゴールドに光る。
密度の高い、熱気のこもった小空間。観客は描かず、空のフロアだけ。
```
**EN:** `Interior of a small live music venue — low ceiling, compact stage, a few golden spotlights. Dense, intimate, warm atmosphere. Empty floor, no audience.`

### 4-3. 武道館 — `assets/items/budokan.png`

```
八角形の大きなホール。天井から放射状にゴールドの光が降り、中央のステージを照らす。
日本の伝統的な建築のシルエット。荘厳で、憧れの場所という格。観客席は空。
```
**EN:** `A large octagonal hall with golden light radiating down from the ceiling onto a central stage. Traditional Japanese architectural silhouette. Solemn, aspirational grandeur. Empty seats.`

### 4-4. ドームツアー — `assets/items/dome_tour.png`

```
巨大なドーム球場の内観を上空から。円形に広がる客席と、中央で輝くゴールドのステージ。
無数の小さな光の点がスタンドを埋めている(人ではなく、光の粒として描く)。
```
**EN:** `Interior of a massive domed stadium seen from above — circular tiers surrounding a glowing golden stage at the center. Countless tiny points of light fill the stands (rendered as light particles, not people).`

### 4-5. ワールドステージ — `assets/items/world_stage.png`

```
宇宙から見た地球。大陸のあちこちからゴールドの光の柱が立ち上り、
それらが弧を描いて結ばれている。最上位にふさわしい壮大さ。
```
**EN:** `Earth seen from space, with golden pillars of light rising from continents around the globe, connected by arcing golden lines. Epic scale befitting the ultimate stage.`

---

## 5. ⚡ 消費アイテム 4点

使うとなくなるアイテム。**一目で「使うもの」と分かる**、単体のアイコン。

### 5-1. エナジードリンク — `assets/items/energy_drink.png`

```
ゴールドと黒のスリムな缶が1本。缶の口から光のはじけるようなエフェクトが立ち上る。
中身が発光しているような透明感。60分だけの一時的な力を感じさせる。
```
**EN:** `A slim gold-and-black energy drink can, with bursting light effects rising from its opening, the contents seeming to glow from within. Conveys a temporary 60-minute surge.`

### 5-2. スポットライト — `assets/items/spotlight.png`

```
1台のスポットライト器具から、真下に向かってゴールドの光の円錐が伸びている。
床に丸い光だまりができている。静かで、その日1日を照らし続ける安定感。
```
**EN:** `A single spotlight fixture casting a golden cone of light downward, forming a circular pool of light on the floor. Calm and steady — it lasts all day.`

### 5-3. フィーバータイム — `assets/items/fever_time.png`

```
ミラーボールが激しく回転し、ゴールドと白の光線が全方向に飛び散っている。
炎のようなオレンジ〜ゴールドのグロー。画面いっぱいの爆発的なエネルギー。
週に1度しか使えない特別感を、明るさと密度で表現する。
```
**EN:** `A mirror ball spinning wildly, shooting golden and white light rays in every direction, with a flame-like orange-to-gold glow. Explosive, screen-filling energy conveying a once-a-week special moment.`

### 5-4. リカバリー — `assets/items/recovery.png`

```
やわらかいゴールドの光に包まれた、ハートまたは盾のシンボル。
まわりに癒しを思わせる淡い光の粒。攻撃的ではなく、守り・いたわりの雰囲気。
「休んだ日を守る」保険なので、静かで優しいトーンにする。
```
**EN:** `A heart or shield symbol wrapped in soft golden light, surrounded by gentle healing particles. Protective and caring rather than aggressive — quiet and kind, as it shields a day of rest.`

---

## 6. Geminiへの依頼文(そのまま貼り付けて使えます)

```
あなたに画像生成をお願いします。

高校生向けの学習記録アプリ「IBUKI STUDY BEAT」で使う、ショップアイテムのアイコン
画像を19点つくりたいです。アプリの世界観は「黒 × ゴールド」で、ダンスとステージが
モチーフです。

まず下の共通スタイルを守ってください:
・黒(#0b0b10)背景、ゴールド(#d9b24a〜#f0c75e)が主役
・正方形1:1、512×512px、中央に被写体1つだけ
・文字・ロゴ・透かしは入れない
・つやのある金属光沢と、ふちの淡いゴールドのグロー
・写実的すぎない、少しデフォルメしたスタイリッシュなイラスト
・小さく表示しても何か分かる形にする

そして重要な制約があります:
・実在の人物に似せないでください。人物の顔・全身は描かず、「モノ」や「情景」だけを
  描いてください。
・ダンスの技名は、足跡・光の軌跡・シルエットなど抽象的な表現に置き換えてください。

以上を踏まえて、次のアイテムの画像を1点ずつ作ってください。
(ここに、上の 2〜5章から作りたいアイテムのプロンプトを貼り付ける)
```

---

## 7. 画像ができたあとの作業(Claude Code担当)

画像を `assets/items/` に置いたら、Claude Code側で次を行う。

| 作業 | 内容 |
|---|---|
| ショップ一覧への表示 | `renderShopItems()` の各行にアイコンを追加 |
| 装備カードへの表示 | `renderEquipCard()` の3スロットにアイコンを追加 |
| Service Worker | `sw.js` の `ASSETS` に画像パスを追加(オフライン対応) |
| 受け入れ試験 | 画像の読み込み失敗(404)がないこと、320px幅で崩れないことを確認 |
| 代替テキスト | 画像が無い場合もテキストだけで成立するようにする(現状の表示を壊さない) |

**画像が揃うまでは現在のテキスト表示のままで問題なく動く。** 段階的に差し替えられる。
