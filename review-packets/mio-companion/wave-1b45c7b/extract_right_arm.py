#!/usr/bin/env python3
"""Extract Mio's visible character-right waving arm at native resolution.

The accepted image is 687x1024.  This script deliberately does not reuse the
842x1264 pose-guide coordinates.  It finds the connected peach skin region
inside a screen-left region of interest, retains the dark anime outline, and
writes a full-canvas transparent PNG plus visual QA previews.

"Right" always means the character's own right side (screen-left here).
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


HERE = Path(__file__).resolve().parent
SOURCE_NAME = "generated-upper-candidate-1.png"
CANVAS = (687, 1024)

# Native candidate-image pixels.  The polygon excludes the face and torso and
# includes the raised hand, wrist, forearm, elbow, and the visible upper-arm
# silhouette.  The shoulder joint itself is occluded and is not invented here.
RIGHT_ARM_REGION = [
    (22, 275),
    (225, 275),
    (225, 445),
    (200, 485),
    (188, 555),
    (184, 680),
    (183, 790),
    (168, 845),
    (142, 870),
    (92, 868),
    (58, 830),
    (48, 765),
    (60, 700),
    (78, 625),
    (91, 555),
    (83, 515),
    (45, 455),
    (25, 390),
]
COMPONENT_SEED = (118, 470)


def polygon_mask() -> Image.Image:
    mask = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(mask).polygon(RIGHT_ARM_REGION, fill=255)
    return mask


def skin_seed(image: Image.Image) -> Image.Image:
    """Return a broad anime-skin seed while rejecting grey, hair, and knit."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    skin = (
        (r >= 135)
        & (g >= 80)
        & (b >= 65)
        & ((r - g) >= 18)
        & ((g - b) >= 3)
        & ((r - b) >= 18)
        & ((r + g + b) >= 350)
    )
    return Image.fromarray((skin.astype(np.uint8) * 255), mode="L")


def connected_component(mask: np.ndarray, seed_xy: tuple[int, int]) -> np.ndarray:
    binary = mask >= 128
    sx, sy = seed_xy
    if not binary[sy, sx]:
        ys, xs = np.nonzero(binary)
        nearest = np.argmin((xs - sx) ** 2 + (ys - sy) ** 2)
        sx, sy = int(xs[nearest]), int(ys[nearest])

    keep = np.zeros(binary.shape, dtype=bool)
    queue: deque[tuple[int, int]] = deque([(sx, sy)])
    keep[sy, sx] = True
    height, width = binary.shape
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height and binary[ny, nx] and not keep[ny, nx]:
                keep[ny, nx] = True
                queue.append((nx, ny))
    return keep.astype(np.uint8) * 255


def build_alpha(source: Image.Image) -> Image.Image:
    seed = skin_seed(source)
    # Join anti-aliased gaps inside the skin region, then retain roughly two
    # pixels of the dark outline.  Clip last so face and torso cannot leak in.
    closed = seed.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3))
    expanded = closed.filter(ImageFilter.MaxFilter(5))
    clipped = np.minimum(np.asarray(expanded), np.asarray(polygon_mask())).astype(np.uint8)
    component = connected_component(clipped, COMPONENT_SEED)
    return Image.fromarray(component, mode="L").filter(ImageFilter.GaussianBlur(0.65))


def checkerboard() -> Image.Image:
    tile = 24
    board = Image.new("RGB", CANVAS, "#d8d8d8")
    draw = ImageDraw.Draw(board)
    for y in range(0, CANVAS[1], tile):
        for x in range(0, CANVAS[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill="#f3f3f3")
    return board.convert("RGBA")


def main() -> None:
    source = Image.open(HERE / SOURCE_NAME).convert("RGB")
    if source.size != CANVAS:
        raise ValueError(f"expected {CANVAS}, got {source.size}")

    alpha = build_alpha(source)
    cutout = source.convert("RGBA")
    cutout.putalpha(alpha)
    cutout.save(HERE / "right-arm.png", optimize=True)

    preview = checkerboard()
    preview.alpha_composite(cutout)
    preview.convert("RGB").save(HERE / "right-arm-preview.png", optimize=True)

    overlay = source.convert("RGBA")
    tint = Image.new("RGBA", CANVAS, (255, 35, 35, 0))
    tint.putalpha(alpha.point(lambda value: round(value * 0.42)))
    overlay.alpha_composite(tint)
    ImageDraw.Draw(overlay).line(RIGHT_ARM_REGION + [RIGHT_ARM_REGION[0]], fill=(0, 255, 255, 255), width=2)
    overlay.convert("RGB").save(HERE / "right-arm-mask-overlay.png", optimize=True)


if __name__ == "__main__":
    main()
