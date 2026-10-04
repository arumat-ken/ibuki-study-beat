#!/usr/bin/env python3
"""腕の切り出し：generated-upper.png から right-arm.png / left-arm.png（透過PNG）を作る。

左右の呼び方（本人基準。画面の左右ではない）:
    right-arm.png = 本人の右手 = 画面の左側
    left-arm.png  = 本人の左手 = 画面の右側
取り違えを防ぐため、切り出した形の重心が画面の正しい側にあるかを検査し、逆なら止まる。

使い方:
    pip install pillow numpy
    python3 cut_arms.py --src generated-upper.png --config arms.json --out .

arms.json の形は arms.example.json を参照。腕の範囲は、多角形（元画像のピクセル座標）か、
白=腕・黒=それ以外のマスク画像のどちらかで指定する。自動検出はしない
（腕は胴の前にあり、服と同じ色になりうるので、境界を自動で決めると黙って誤る）。

出力:
    right-arm.png / left-arm.png  腕の bbox で切った RGBA
    arms_meta.json                 元画像での bbox、アンカー、重心、面積、検査結果
    arms_preview.png               元画像に輪郭を重ねたもの（赤=本人の右、青=本人の左）。目視確認用
"""
import argparse
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIDES = {
    # name: (出力ファイル, 画面上の側, 輪郭色)
    "right": ("right-arm.png", "screen_left", (220, 40, 40, 255)),
    "left": ("left-arm.png", "screen_right", (40, 90, 230, 255)),
}
SS = 4  # 多角形を描くときの超解像倍率（縁をなめらかにする）


def load_mask(spec, size, base_dir):
    """spec から 0..255 のマスク（元画像と同じ大きさ）を作る。"""
    w, h = size
    if "polygon" in spec:
        pts = spec["polygon"]
        if len(pts) < 3:
            raise SystemExit("polygon は3点以上が必要です")
        for x, y in pts:
            if not (0 <= x <= w and 0 <= y <= h):
                raise SystemExit(f"polygon の点 ({x},{y}) が画像 {w}x{h} の外です。"
                                 "割合(0..1)ではなくピクセルで書いてください")
        if max(max(abs(x), abs(y)) for x, y in pts) <= 1.5:
            raise SystemExit("polygon の座標が 0..1 の割合に見えます。元画像のピクセルで書いてください"
                             "（x は幅、y は高さに対する割合になり、縦長の画像では混ぜると 1.5 倍ずれます）")
        big = Image.new("L", (w * SS, h * SS), 0)
        ImageDraw.Draw(big).polygon([(x * SS, y * SS) for x, y in pts], fill=255)
        return big.resize((w, h), Image.LANCZOS)
    if "mask" in spec:
        m = Image.open(base_dir / spec["mask"]).convert("L")
        if m.size != (w, h):
            raise SystemExit(f"マスク {spec['mask']} の大きさ {m.size} が元画像 {(w, h)} と違います")
        return m
    raise SystemExit("各腕に polygon か mask のどちらかを指定してください")


def components(alpha, thresh=128, min_frac=0.002):
    """アルファの連結成分のうち、面積が全体の min_frac 以上のものの数（1/4に縮小して数える）。"""
    small = np.asarray(Image.fromarray(alpha).resize(
        (max(1, alpha.shape[1] // 4), max(1, alpha.shape[0] // 4)), Image.BILINEAR)) >= thresh
    seen = np.zeros_like(small, dtype=bool)
    total = small.sum()
    count = 0
    for y, x in zip(*np.nonzero(small)):
        if seen[y, x]:
            continue
        q = deque([(y, x)])
        seen[y, x] = True
        n = 0
        while q:
            cy, cx = q.popleft()
            n += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < small.shape[0] and 0 <= nx < small.shape[1] \
                        and small[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if total and n / total >= min_frac:
            count += 1
    return count


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="generated-upper.png")
    ap.add_argument("--config", required=True, help="arms.json")
    ap.add_argument("--out", default=".", help="出力フォルダ")
    ap.add_argument("--allow-crossed", action="store_true",
                    help="左右の重心検査を無効にする（腕が胴の反対側へ回るポーズ用。理由を記録すること）")
    a = ap.parse_args()

    cfg_path = Path(a.config)
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    src = Image.open(a.src).convert("RGBA")
    w, h = src.size
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    feather = float(cfg.get("feather", 1.5))
    pad = int(cfg.get("pad", 4))
    src_a = np.asarray(src.getchannel("A"))
    meta = {"source": Path(a.src).name, "size": [w, h], "pose": cfg.get("pose"), "arms": {}}
    problems = []
    preview = src.copy()
    draw = ImageDraw.Draw(preview)

    for side, (fname, where, color) in SIDES.items():
        if side not in cfg:
            problems.append(f"{side}: arms.json に指定がありません")
            continue
        spec = cfg[side]
        mask = load_mask(spec, (w, h), cfg_path.parent)
        if feather > 0:
            mask = mask.filter(ImageFilter.GaussianBlur(feather))
        alpha = (np.asarray(mask, dtype=np.float32) * (src_a / 255.0)).astype(np.uint8)
        ys, xs = np.nonzero(alpha >= 128)
        if xs.size == 0:
            problems.append(f"{side}: 切り出した範囲が空です")
            continue

        # 左右の検査：本人の右 = 画面の左。重心が反対側なら、名前の付け間違いの可能性が高い。
        cx = float(xs.mean())
        ok_side = cx < w / 2 if where == "screen_left" else cx > w / 2
        if not ok_side and not a.allow_crossed:
            raise SystemExit(
                f"{side}: 重心 x={cx:.0f} が画面の{'左' if where == 'screen_left' else '右'}半分にありません"
                f"（画像幅 {w}）。本人の右手は画面の左です。範囲の取り違えを確認してください。"
                "意図的なら --allow-crossed")

        x0, y0 = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
        x1, y1 = min(w, int(xs.max()) + 1 + pad), min(h, int(ys.max()) + 1 + pad)
        arr = np.asarray(src).copy()
        arr[..., 3] = alpha
        Image.fromarray(arr[y0:y1, x0:x1], "RGBA").save(out / fname)

        touches = [n for n, hit in (("上", y0 == 0), ("下", y1 == h), ("左", x0 == 0), ("右", x1 == w)) if hit]
        n_comp = components(alpha)
        if n_comp != 1:
            problems.append(f"{side}: 離れた塊が {n_comp} 個あります（腕は1つの塊のはず。ゴミか欠けを確認）")
        info = {
            "file": fname,
            "bbox_src_px": [int(x0), int(y0), int(x1), int(y1)],
            "size": [int(x1 - x0), int(y1 - y0)],
            "centroid_src_px": [round(cx, 1), round(float(ys.mean()), 1)],
            "area_px": int((alpha >= 128).sum()),
            "components": n_comp,
            "touches_image_edge": touches,
        }
        for key in ("shoulder", "elbow", "wrist", "fingertip"):
            if key in spec:
                px, py = spec[key]
                info[key + "_src_px"] = [px, py]
                info[key + "_in_sprite_px"] = [round(px - x0, 1), round(py - y0, 1)]
        meta["arms"][side] = info
        if touches and touches != ["下"]:
            problems.append(f"{side}: 切り出しが画像の {'・'.join(touches)} 端に接しています（下端以外は欠けの疑い）")

        # 目視用の輪郭
        edge = Image.fromarray(alpha).filter(ImageFilter.FIND_EDGES)
        ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ov.paste(Image.new("RGBA", (w, h), color), mask=edge.point(lambda v: 255 if v > 40 else 0))
        preview = Image.alpha_composite(preview, ov)
        draw = ImageDraw.Draw(preview)

    preview.convert("RGB").save(out / "arms_preview.png")
    meta["problems"] = problems
    (out / "arms_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"出力先: {out.resolve()}")
    for side, info in meta["arms"].items():
        print(f"  {info['file']}: {info['size'][0]}x{info['size'][1]}px, 重心 {info['centroid_src_px']}, 塊 {info['components']}")
    if problems:
        print("要確認:")
        for p in problems:
            print("  - " + p)
        sys.exit(2)
    print("機械検査は通りました。指の本数・左右の手の形・親指と小指の向きは、この検査では見ていません。"
          " arms_preview.png と right-arm.png / left-arm.png を目で確認してください。")


if __name__ == "__main__":
    main()
