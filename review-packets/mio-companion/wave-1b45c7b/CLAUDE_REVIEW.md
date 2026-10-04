# Claude Code independent review — wave candidate 1

- reviewed: 2026-10-04 14:33:28 JST
- public review commit: `f7016d482673bd016d602a21b7a16956c4bf9910`
- reviewer: Claude Code
- repository changes by reviewer: none

## Verdict

- pose guide: accepted
- generated image: accepted
- mirror evidence relative to the supplied identity reference: none

Claude Code opened all three PNG files, verified the recorded hashes, and inspected the hand and arm at enlarged scale.

## Handedness evidence

The screen-left waving hand is the character's anatomical right hand:

- palm creases and finger pads face the camera;
- the thumb is on screen-right toward the face;
- the little finger is on screen-left away from the face;
- five fingers are present;
- the arm does not cross the body centreline.

In the guide, the right thumb tip is 65 pixels to screen-right of the wrist and the right little-finger side extends 85 pixels to screen-left of the wrist.

## Mirror comparison

Claude compared the face and upper body with `identity-reference-medium.png` in the public review packet:

| comparison | mean pixel difference |
|---|---:|
| identity reference as supplied | 2.95 |
| horizontally flipped reference | 37.25 |

The mole, earrings, pendant, and hair flow also remain on the same sides. This proves that the candidate is not horizontally flipped relative to the supplied reference. It does not independently prove whether the reference itself was mirrored before it entered the project.

## Limits and required follow-up

1. The guide forearm is shorter than its hand and does not match the generated image's elbow position.
2. The guide is 842×1264; the generated candidate is 687×1024. The scale differs by axis.
3. `pose.json` is a generation and handedness guide. Its coordinates must not be used for pixel extraction.
4. The shoulder and upper arm connection is occluded, so its continuity is inferred rather than directly verified.
5. The character-left hand is outside the image and cannot be checked for handedness or finger count.
6. `render_guide.py` must accompany the public packet for reproducibility.
7. The generation model remains `未記録`; no model name should be inferred without verifiable evidence.

The accepted generated image must not be regenerated for these issues. Any arm extraction must use a newly measured mask in the candidate image's own 687×1024 coordinate system.
