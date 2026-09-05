#!/usr/bin/env python3
"""3D参照画像が、指示どおりの名前で揃っているかを見る。

    python3 tools/avatar3d_check.py [フォルダ]

正本 docs/design/avatar3d_multiview_prompts.json から要る名前を組み立て、
実際のファイルと突き合わせる。**枚数と名前しか分からない。**
影が入っていないか、Aポーズが崩れていないかは目で見るしかない
(観点は docs/design/AVATAR3D_INTAKE.md 5.3節)。

終了コード: 揃っていれば 0、足りなければ 1
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROMPTS = ROOT / "docs/design/avatar3d_multiview_prompts.json"
DEFAULT_DIR = ROOT / "docs/design/reference/avatar3d"


def real_keys(d: dict) -> list[str]:
    """`_note` のような、指示用のキーを除く。"""
    return [k for k in d if not k.startswith("_")]


def expected(spec: dict) -> list[str]:
    counts = spec["counts"]
    directions = real_keys(spec["views"]["turnaround"])
    names = [
        f"turn_{outfit}_{d}.png"
        for outfit in counts["outfits_for_turnaround"]
        for d in directions
    ]
    names += [f"{k}.png" for k in real_keys(spec["views"]["face"])]
    names += [f"expr_{k}.png" for k in real_keys(spec["expressions"])]
    names += [f"viseme_{k}.png" for k in real_keys(spec["visemes"])]
    return names


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DIR
    spec = json.loads(PROMPTS.read_text(encoding="utf-8"))
    want = expected(spec)

    declared = spec["counts"]["total"]
    if len(want) != declared:
        print(f"NG: 正本の枚数の宣言が合っていない({len(want)} 通り / 宣言 {declared})")
        return 1

    have = {p.name for p in target.glob("*.png")} if target.is_dir() else set()
    missing = [n for n in want if n not in have]
    extra = sorted(have - set(want))

    print(f"置き場所: {target}")
    print(f"要る枚数: {len(want)} / 見つかった: {len(have) - len(extra)}")

    if not have:
        print("\nまだ1枚も置かれていない。Gemini の生成待ち。")
        print("指示は docs/design/AVATAR3D_INTAKE.md 5章。")
        return 1

    for name in missing:
        print(f"  足りない: {name}")
    for name in extra:
        print(f"  余分(名前が違う?): {name}")

    if missing or extra:
        print(f"\n{len(missing)} 枚不足 / {len(extra)} 枚が想定外の名前")
        return 1

    print("\nOK: 48枚すべて揃っている。")
    print("※ 影・Aポーズ・指の本数は目で見ること(AVATAR3D_INTAKE.md 5.3節)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
