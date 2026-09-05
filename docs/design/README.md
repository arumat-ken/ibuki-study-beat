# 設計フォルダ — GUI設計の受け渡し場所

> 🔗 AI同士の役割分担・受け渡しの取り決めは [`../exchange/PROTOCOL.md`](../exchange/PROTOCOL.md)、
> 現在の進行状況は [`../exchange/STATUS.md`](../exchange/STATUS.md) を参照。

IBUKI STUDY BEAT の大型アップデート(ver. 4.x)に向けた、**GUI設計の受け渡しフォルダ**です。
ChatGPT が画面設計を行い、Claude(Claude Code)が実装します。

## このフォルダの中身

| ファイル | 役割 | 誰が書くか |
|---|---|---|
| `BRIEF_FOR_GPT.md` | **ChatGPTに渡す依頼書(プロンプト全文)** | Claude(作成済み) |
| `APP_CONTEXT.md` | 現行アプリ ver.3.3.0 の仕様。GPTが前提として読む | Claude(作成済み) |
| `FEATURE_SPEC_v4.md` | 追加機能の確定設計(ポイント・ニュース・金融) | Claude(作成済み) |
| `GUI_SPEC_v4.md` | **← ChatGPTの成果物①(設計書)を置く場所** | **ChatGPT** |
| `AVATAR_TALK_DESIGN.md` | **AI会話アニメーションツールの設計と実装手順**(本体アプリとは独立したPythonツール) | Claude(作成済み) |
| `AVATAR_TALK_GEMINI_BRIEF.md` | **Geminiに渡す画像26枚の指示書**(表情18枚+全身8枚) | Claude(作成済み) |
| `avatar_face_prompts.json` | 画像生成プロンプトの正本。**Codexが直接推敲してよい** | Claude→**Codex** |
| `reference/character_base_v1.jpg` | キャラクターの基準画像(Gemini生成・確定済み) | Gemini |
| `AVATAR3D_INTAKE.md` | **3Dアプリ依頼の受け皿**。役割分担・段階・置き場所 | Claude(作成済み) |
| `avatar3d_multiview_prompts.json` | 3D参照48枚のプロンプトの正本 | Claude→**Codex** |
| `AVATAR3D_APP_SPEC.md` | **← ChatGPTの成果物①(アプリ設計書)を置く場所** | **ChatGPT** |
| `AVATAR3D_MODEL_SPEC.md` | **← ChatGPTの成果物②(3Dモデル仕様)を置く場所** | **ChatGPT** |
| `reference/avatar3d/` | **← Geminiの3D参照48枚を置く場所** | **Gemini** |
| `../mockups/v4.html` | **← ChatGPTの成果物②(HTMLモック)を置く場所** | **ChatGPT** |

## 進め方

```
① 親（arumat-ken）が ChatGPT に BRIEF_FOR_GPT.md を渡す
        ↓
② ChatGPT が設計書とHTMLモックを出力
        ↓
③ 出力を GUI_SPEC_v4.md と ../mockups/v4.html に保存してコミット
        ↓
④ Claude に「設計書を読んで」と伝える
        ↓
⑤ Claude がレビュー → 計算ロジック+テスト → UI実装 → 段階リリース
```

## ChatGPTへの渡し方(2通り)

### 方法A: URLを教える(推奨・ブラウジング可能なGPTの場合)

このリポジトリは公開されているため、ChatGPTに次のURLを渡せばそのまま読めます。

```
https://raw.githubusercontent.com/arumat-ken/ibuki-study-beat/main/docs/design/BRIEF_FOR_GPT.md
https://raw.githubusercontent.com/arumat-ken/ibuki-study-beat/main/docs/design/APP_CONTEXT.md
https://raw.githubusercontent.com/arumat-ken/ibuki-study-beat/main/docs/design/FEATURE_SPEC_v4.md
```

フォルダ全体を見せる場合:
```
https://github.com/arumat-ken/ibuki-study-beat/tree/main/docs/design
```

実際に動いているアプリを見せる場合:
```
https://arumat-ken.github.io/ibuki-study-beat/
```

### 方法B: 本文をコピーして貼り付ける

`BRIEF_FOR_GPT.md` の中身をそのままコピーしてChatGPTに貼り付けてください。
単体で成立するように書いてあります。

## Claudeへの戻し方

1. **リポジトリにコミット(推奨)** — 上記の所定パスに保存してコミット。
   Claudeがファイルを直接読み、HTMLモックは実際にレンダリングしてスクリーンショットで確認します。
2. **チャットに貼り付け** — 長い場合は分割で構いません。

## 守ってほしい原則(設計・実装の共通指針)

> **このアプリの主役は「毎日の受験勉強時間の確保と、その見える化」。**
> ポイント・ショップ・金融は、勉強を続けるための燃料であって主役ではない。
> アプリを開いた瞬間に目に入るべきは「今日やること」と「学習を開始する ▶」。

この原則に反する設計は、どれだけ魅力的でも採用しません。
