# 3D参照画像の置き場所(48枚)

**Gemini が作った参照画像をここへ置く。** 空のまま待っている状態。

指示の正本は [`../../avatar3d_multiview_prompts.json`](../../avatar3d_multiview_prompts.json)、
経緯と役割分担は [`../../AVATAR3D_INTAKE.md`](../../AVATAR3D_INTAKE.md)。

## これは何のための画像か

**表示に使う絵ではない。3Dモデラーが立体に起こすための設計図。**
会話用の2D画像(`../../avatar_face_prompts.json`)とは要求が正反対で、
背景も影も演出も**邪魔になる**。混同しないこと。

## ファイル名(この名前でないと検査が通らない)

| 種類 | ファイル名 | 枚数 |
|---|---|---|
| ターンアラウンド | `turn_<衣装>_<方向>.png` | 32 |
| 顔のアップ | `face_<方向>.png` | 3 |
| 表情 | `expr_<感情>.png` | 7 |
| 口の形 | `viseme_<音>.png` | 6 |

- 衣装: `base_body` / `outfit_01_base` / `outfit_02_casual` / `outfit_03_formal`
- 方向: `front` / `front_left_45` / `left` / `back_left_45` / `back` / `back_right_45` / `right` / `front_right_45`
- 顔: `front` / `left_45` / `left`
- 感情: `neutral` / `joy` / `anger` / `sad` / `fun` / `surprise` / `blink`
- 音: `a` / `i` / `u` / `e` / `o` / `closed`

例: `turn_base_body_front.png` / `face_left.png` / `expr_joy.png` / `viseme_a.png`

## 揃ったら

```
python3 tools/avatar3d_check.py
```

**足りない枚数と、名前の間違いだけ**が分かる。
影が入っていないか、Aポーズが崩れていないかは**目で見るしかない**。
確認の観点は `AVATAR3D_INTAKE.md` 5.3節。
