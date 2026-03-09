# 3D boxing models

Place production GLB models in this folder for the upgraded React Three Fiber boxing arena.

## Required files

- `/public/models/male-boxer.glb`
- `/public/models/female-boxer.glb`
- `/public/models/referee.glb` (optional but recommended)

The game will gracefully fall back to procedural avatars if any file is missing.

## Required animation clip names

Use these names (case-insensitive). Synonyms are supported, but exact names are best:

| Name       | Purpose                 |
|------------|-------------------------|
| `idle`     | Neutral stance          |
| `jab`      | Quick lead punch        |
| `cross`    | Rear straight punch     |
| `hook`     | Hook punch              |
| `uppercut` | Uppercut punch          |
| `block`    | Guard defense           |
| `dodge`    | Slip / evade            |
| `knockout` | KO reaction             |
| `victory`  | Post-fight celebration  |

## Material naming tips

If mesh names include keywords below, the game auto-applies fighter customization colors:

- `glove`
- `short`
- `shoe`
- `skin`, `body`, or `face`
