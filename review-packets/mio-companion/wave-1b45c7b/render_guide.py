#!/usr/bin/env python3
"""Render the deterministic medium-shot 'wave' pose guide."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
SCALE = 2
WIDTH, HEIGHT = 842, 1264


def p(point: tuple[int, int] | list[int]) -> tuple[int, int]:
    return int(point[0] * SCALE), int(point[1] * SCALE)


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size * SCALE, index=0)
    return ImageFont.load_default()


def centered(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, size: int, fill: str) -> None:
    draw.text(p(xy), text, font=font(size), fill=fill, anchor="mm")


def draw_hand(draw: ImageDraw.ImageDraw, points: list[list[int]], color: str) -> None:
    connections = [
        (0, 1), (1, 2), (2, 3), (3, 4),
        (0, 5), (5, 6), (6, 7), (7, 8),
        (0, 9), (9, 10), (10, 11), (11, 12),
        (0, 13), (13, 14), (14, 15), (15, 16),
        (0, 17), (17, 18), (18, 19), (19, 20),
    ]
    for start, end in connections:
        draw.line([p(points[start]), p(points[end])], fill=color, width=5 * SCALE)
    for index, point in enumerate(points):
        radius = 8 if index in (0, 4, 8, 12, 16, 20) else 7
        x, y = p(point)
        draw.ellipse(
            (x - radius * SCALE, y - radius * SCALE, x + radius * SCALE, y + radius * SCALE),
            fill="#ffffff",
            outline=color,
            width=4 * SCALE,
        )


def draw_arm(draw: ImageDraw.ImageDraw, side: dict) -> None:
    color = side["color"]
    chain = [side["pose"][name] for name in ("shoulder", "elbow", "wrist")]
    draw.line([p(point) for point in chain], fill=color, width=22 * SCALE, joint="curve")
    draw.line([p(point) for point in chain], fill="#ffffff", width=8 * SCALE, joint="curve")
    draw.line([p(point) for point in chain], fill=color, width=7 * SCALE, joint="curve")
    for point in chain:
        x, y = p(point)
        draw.ellipse((x - 11 * SCALE, y - 11 * SCALE, x + 11 * SCALE, y + 11 * SCALE), fill="#ffffff", outline=color, width=4 * SCALE)
    draw_hand(draw, side["hand"], color)


def main() -> None:
    pose = json.loads((HERE / "pose.json").read_text(encoding="utf-8"))
    image = Image.new("RGB", (WIDTH * SCALE, HEIGHT * SCALE), "#f5f2eb")
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((22 * SCALE, 22 * SCALE, 820 * SCALE, 1242 * SCALE), radius=28 * SCALE, outline="#37332d", width=4 * SCALE)
    centered(draw, (421, 62), "Mio『手を振る』骨格ガイド", 28, "#25221e")
    centered(draw, (421, 101), "中距離構図 / 赤＝本人の右 / 青＝本人の左", 18, "#5a554d")

    # Medium-shot silhouette follows the accepted generated-upper framing.
    draw.ellipse((250 * SCALE, 120 * SCALE, 592 * SCALE, 510 * SCALE), fill="#d7d2c8", outline="#746e65", width=5 * SCALE)
    torso = [(330, 485), (280, 525), (140, 550), (185, 1220), (657, 1220), (702, 550), (562, 525), (512, 485)]
    draw.polygon([p(point) for point in torso], fill="#ded9cf")
    draw.line([p(torso[-1]), *[p(point) for point in torso], p(torso[0])], fill="#746e65", width=5 * SCALE, joint="curve")

    draw_arm(draw, pose["characterRight"])
    draw_arm(draw, pose["characterLeft"])

    draw.rounded_rectangle((48 * SCALE, 690 * SCALE, 292 * SCALE, 752 * SCALE), radius=18 * SCALE, fill="#ffffff", outline="#d83a3a", width=4 * SCALE)
    centered(draw, (170, 721), "本人の右手で振る R", 22, "#b72727")
    draw.rounded_rectangle((550 * SCALE, 690 * SCALE, 794 * SCALE, 752 * SCALE), radius=18 * SCALE, fill="#ffffff", outline="#2674d9", width=4 * SCALE)
    centered(draw, (672, 721), "本人の左腕は下ろす L", 21, "#155caf")

    # Two curved arcs show movement without changing the canonical hand pose.
    draw.arc((78 * SCALE, 330 * SCALE, 280 * SCALE, 590 * SCALE), start=195, end=285, fill="#d83a3a", width=5 * SCALE)
    draw.arc((100 * SCALE, 350 * SCALE, 302 * SCALE, 610 * SCALE), start=195, end=285, fill="#d83a3a", width=5 * SCALE)
    centered(draw, (88, 390), "小さく左右へ", 17, "#b72727")

    draw.rounded_rectangle((48 * SCALE, 1130 * SCALE, 794 * SCALE, 1228 * SCALE), radius=18 * SCALE, fill="#ffffff", outline="#8b8479", width=3 * SCALE)
    centered(draw, (421, 1155), "非鏡像：右手の掌紋をカメラへ向け、指先を上にする", 19, "#37332d")
    centered(draw, (421, 1185), "右親指＝顔側（画面右） / 右小指＝外側（画面左） / 左腕は静止", 16, "#37332d")
    centered(draw, (421, 1213), "色・文字・人形はコピーせず、関節・左右・各手5本指だけ参照", 16, "#37332d")

    image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS).save(HERE / "pose-guide.png", optimize=True)


if __name__ == "__main__":
    main()
