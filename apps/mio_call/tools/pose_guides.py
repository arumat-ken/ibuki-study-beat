#!/usr/bin/env python3
"""pose_defs_stage2.json から骨格を計算して検査し、確認用の骨格図を描く。

腕は『肩 → 肘 → 手首』の2本の骨で、長さを固定する。手首の目標位置から肘を逆算する
（2関節IK）ので、骨の長さは定義上つねに保たれる。届かない位置を書くとエラーになる。

使い方:
    pip install pillow
    python3 pose_guides.py --defs pose_defs_stage2.json --out guides_out
出力: <pose>.png（骨格図）, contact_sheet.png（5枚並べ）, skeleton.json（計算した関節座標）
左右: R = 本人の右手 = 画面の左 / L = 本人の左手 = 画面の右。
"""
import argparse
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

PPU = 200            # 1 SW あたりのピクセル数
X0, X1 = -1.6, 1.6   # 描く範囲（SW）
Y0, Y1 = -1.3, 1.9
SHOULDER_X = {"R": -0.5, "L": 0.5}


def dirvec(deg):
    r = math.radians(deg)
    return math.cos(r), math.sin(r)


def solve_elbow(s, w, u, f, bend):
    dx, dy = w[0] - s[0], w[1] - s[1]
    d = math.hypot(dx, dy)
    if d > u + f + 1e-9:
        raise ValueError(f"手首が遠すぎて届きません（距離 {d:.3f} > 腕の長さ {u + f:.3f}）")
    if d < abs(u - f) - 1e-9:
        raise ValueError(f"手首が肩に近すぎます（距離 {d:.3f}）")
    a = (u * u - f * f + d * d) / (2 * d)
    h = math.sqrt(max(0.0, u * u - a * a))
    px, py = s[0] + a * dx / d, s[1] + a * dy / d
    cands = [(px - h * dy / d, py + h * dx / d), (px + h * dy / d, py - h * dx / d)]
    key = {"down": lambda p: p[1], "up": lambda p: -p[1],
           "out": lambda p: abs(p[0]), "in": lambda p: -abs(p[0])}[bend]
    return max(cands, key=key)


def build_arm(side, spec, lim):
    s = (SHOULDER_X[side], 0.0)
    w = tuple(spec["wrist"])
    deg = spec["hand_deg"]
    tip_len = lim["index"] if spec.get("tip") == "index" else lim["hand"]
    dv = dirvec(deg)
    e = solve_elbow(s, w, lim["upper_arm"], lim["forearm"], spec["bend"])
    tip = (w[0] + tip_len * dv[0], w[1] + tip_len * dv[1])
    mid_tip = (w[0] + lim["hand"] * dv[0], w[1] + lim["hand"] * dv[1])
    return {"shoulder": s, "elbow": e, "wrist": w, "fingertip": tip, "middle_tip": mid_tip, "hand_deg": deg}


def mirror(spec):
    m = dict(spec)
    m["wrist"] = [-spec["wrist"][0], spec["wrist"][1]]
    m["hand_deg"] = 180 - spec["hand_deg"]
    return m


def check(pose_name, arms, defs_pose):
    """機械的に確かめられることだけを確かめる。指の本数・親指の向きの絵は見ていない。"""
    issues = []
    for side, a in arms.items():
        if side == "R" and a["shoulder"][0] >= 0:
            issues.append("R の肩が画面の右にある（本人の右手は画面の左）")
        if side == "L" and a["shoulder"][0] <= 0:
            issues.append("L の肩が画面の左にある（本人の左手は画面の右）")
        for name in ("elbow", "wrist", "fingertip"):
            x, y = a[name]
            if not (X0 <= x <= X1 and Y0 <= y <= Y1):
                issues.append(f"{side}.{name} ({x:.2f},{y:.2f}) が描画範囲の外")
    if "R" in arms and "L" in arms:
        # 両手のポーズ：左右が入れ替わっていないか（手首の x が R<L）
        if arms["R"]["wrist"][0] > arms["L"]["wrist"][0]:
            issues.append("R の手首が L の手首より画面の右にある（腕が交差。意図したポーズか確認）")
    return issues


def to_px(p):
    return ((p[0] - X0) * PPU, (p[1] - Y0) * PPU)


def render(name, label, arms, specs):
    w, h = int((X1 - X0) * PPU), int((Y1 - Y0) * PPU)
    im = Image.new("RGB", (w, h), (246, 242, 234))
    d = ImageDraw.Draw(im)
    # 頭・首・肩・胴（目安）
    cx, cy = to_px((0, -0.62))
    d.ellipse([cx - 0.27 * PPU, cy - 0.40 * PPU, cx + 0.27 * PPU, cy + 0.40 * PPU], outline=(150, 140, 125), width=3)
    d.line([to_px((0, -0.22)), to_px((0, 0))], fill=(150, 140, 125), width=3)
    d.line([to_px((-0.5, 0)), to_px((0.5, 0))], fill=(150, 140, 125), width=3)
    d.line([to_px((-0.45, 0)), to_px((-0.40, 1.9))], fill=(200, 192, 178), width=2)
    d.line([to_px((0.45, 0)), to_px((0.40, 1.9))], fill=(200, 192, 178), width=2)
    d.line([to_px((0, -1.3)), to_px((0, 1.9))], fill=(225, 218, 205), width=1)   # 中心線
    colors = {"R": (200, 50, 45), "L": (45, 90, 200)}
    for side, a in arms.items():
        c = colors[side]
        d.line([to_px(a["shoulder"]), to_px(a["elbow"]), to_px(a["wrist"])], fill=c, width=8)
        d.line([to_px(a["wrist"]), to_px(a["middle_tip"])], fill=c, width=14)
        d.line([to_px(a["wrist"]), to_px(a["fingertip"])], fill=(30, 30, 30), width=2)
        for k in ("shoulder", "elbow", "wrist"):
            x, y = to_px(a[k])
            d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(255, 255, 255), outline=c, width=3)
        # 親指(緑)・小指(橙)の向きの目安
        sp = specs[side]
        mx, my = ((a["wrist"][0] + a["middle_tip"][0]) / 2, (a["wrist"][1] + a["middle_tip"][1]) / 2)
        for who, col in (("thumb", (40, 150, 70)), ("pinky", (230, 140, 30))):
            v = sp.get(who)
            off = {"up": (0, -1), "down": (0, 1), "outward": (1 if side == "L" else -1, 0),
                   "inward": (-1 if side == "L" else 1, 0)}.get(v)
            x, y = to_px((mx, my))
            if off:
                x, y = x + off[0] * 0.17 * PPU, y + off[1] * 0.17 * PPU
                d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=col)
            else:   # hidden / front / 他：丸だけ（中抜き）
                d.ellipse([x - 7, y - 7, x + 7, y + 7], outline=col, width=3)
    d.text((10, 8), name, fill=(30, 30, 30))   # 既定フォントは日本語を描けないので英名のみ
    d.text((10, 24), "screen LEFT = person's RIGHT (red)   screen RIGHT = person's LEFT (blue)", fill=(90, 90, 90))
    d.text((10, 40), "green dot = thumb side, orange dot = pinky side (hollow = hidden / front)", fill=(90, 90, 90))
    return im


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--defs", required=True)
    ap.add_argument("--out", default="guides_out")
    a = ap.parse_args()
    defs = json.loads(Path(a.defs).read_text(encoding="utf-8"))
    lim = defs["limits"]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    sheet_items, skeleton, bad = [], {}, False
    for name, p in defs["poses"].items():
        arms, specs = {}, {}
        for side in ("R", "L"):
            sp = p[side]
            if sp.get("mode") == "base":
                continue
            if "mirror_of" in sp:
                sp = {**mirror(p[sp["mirror_of"]]), **{k: v for k, v in sp.items() if k != "mirror_of"}}
            try:
                arms[side] = build_arm(side, sp, lim)
            except ValueError as e:
                print(f"[エラー] {name}.{side}: {e}")
                bad = True
                continue
            specs[side] = sp
        issues = check(name, arms, p)
        for i in issues:
            print(f"[要確認] {name}: {i}")
        skeleton[name] = {s: {k: ([round(v, 3) for v in x] if isinstance(x, (tuple, list)) else x)
                              for k, x in arm.items()} for s, arm in arms.items()}
        if arms:
            img = render(name, p["label"], arms, specs)
            img.save(out / f"{name}.png")
            sheet_items.append(img)
        for side, arm in arms.items():
            ul = math.dist(arm["shoulder"], arm["elbow"])
            fl = math.dist(arm["elbow"], arm["wrist"])
            print(f"{name:13s} {side}: 上腕 {ul:.3f} 前腕 {fl:.3f}（定義値 {lim['upper_arm']} / {lim['forearm']}）"
                  f" 肘=({arm['elbow'][0]:.2f},{arm['elbow'][1]:.2f}) 指先=({arm['fingertip'][0]:.2f},{arm['fingertip'][1]:.2f})")
    if sheet_items:
        tw = sheet_items[0].width // 2
        th = sheet_items[0].height // 2
        sheet = Image.new("RGB", (tw * len(sheet_items), th), (255, 255, 255))
        for i, im in enumerate(sheet_items):
            sheet.paste(im.resize((tw, th), Image.LANCZOS), (i * tw, 0))
        sheet.save(out / "contact_sheet.png")
    (out / "skeleton.json").write_text(json.dumps(skeleton, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"出力先: {out.resolve()}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
