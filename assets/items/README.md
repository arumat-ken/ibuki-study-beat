# ショップアイテムの画像

Issue #3 (APP-430) 用。ショップ・装備欄に表示するアイコン画像を置く場所。

## 命名規則

ファイル名は **アプリ内部のアイテムIDと一致させること**。ここがずれると画像が紐付かない。

| カテゴリ | ファイル名 |
|---|---|
| 衣装 | `socks.png` `gloves.png` `fedora.png` `belt.png` `jacket.png` |
| スキル | `rhythm_keep.png` `moonwalk.png` `spin_turn.png` `zero_gravity.png` `anti_gravity_lean.png` |
| ステージ | `street.png` `live_house.png` `budokan.png` `dome_tour.png` `world_stage.png` |
| 消費アイテム | `energy_drink.png` `spotlight.png` `fever_time.png` `recovery.png` |

計19点。

## 仕様

- 512×512px、正方形、PNG
- 黒(#0b0b10)背景 / ゴールド(#d9b24a〜#f0c75e)主体
- 文字・ロゴ・透かしを含まない
- 人物(顔・手・全身)を含まない

生成用プロンプトの正本は [`docs/design/item_image_prompts.json`](../../docs/design/item_image_prompts.json)。

## 注意

- **外部URLから画像を読み込まない。** 採用する画像は必ずこのリポジトリ内に置く(Issue #3の保護条件)
- 画像が揃っていなくても、アプリはテキスト表示のまま動作する。**揃った分から順に組み込める**
- 追加したらオフライン対応のため `sw.js` の `ASSETS` にもパスを足すこと
