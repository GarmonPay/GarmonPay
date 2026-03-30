# Fighter 2D layered assets

Professional layered avatar for the manual fighter builder and `Fighter3D` fallback (no Meshy GLB).

## Folder layout

| Folder | Role |
|--------|------|
| `body/` | Base athletic body + skin (vector art). |
| `face/` | Transparent facial expression overlays. |
| `hair/` | Hair styles (omit layer for `bald`). |
| `gloves/` | Boxing gloves; `GLOVE_FILL` placeholder (often fighter accent / trunks). |
| `shorts/` | Trunks; `SHORTS_FILL` placeholder. |
| `shoes/` | Ring shoes + socks. |
| `accessories/` | Headgear, belts, etc.

## PNG vs SVG

Shipped art uses **`.svg`** (scalable, transparent). To switch to **PNG**, add a file with the **same basename** (e.g. `body_middleweight.png`) and set `FIGHTER_ASSET_FORMAT` in `src/lib/fighter-avatar-assets.ts` to `'png'`, or replace files in place.

Recommended export: **2×** resolution PNG with transparency, aligned to the same **viewBox / proportions** as the SVG (see each file’s `viewBox`).

## Placeholders (replaced at runtime)

- Body SVG: `SKIN_LIGHT`, `SKIN_DARK` on gradient stops (see `body_middleweight.svg`).
- Shorts: `SHORTS_FILL`; gloves: `GLOVE_FILL`.

If you rename or remove these literals, update the replacements in `src/components/arena/LayeredFighterAvatar.tsx`.
