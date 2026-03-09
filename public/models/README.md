# Boxer GLB for Fight Arena

Place a boxer character model here to replace the placeholder fighters in the 3D fight arena.

## File

- **Path:** `boxer.glb` (or `boxer.gltf`) in this folder (`public/models/`).
- The app loads: `/models/boxer.glb`.

## Animation names

The GLB should include **animation groups** (or clips) with these names (case-insensitive):

| Name         | Use              | Loop |
|-------------|------------------|------|
| `idle`      | Standing still   | Yes  |
| `jab`      | Jab button       | No   |
| `powerPunch`| Power punch      | No   |
| `block`     | Blocking         | No   |
| `knockout`  | When health = 0  | No   |

If the file is missing or fails to load, no fighter geometry is shown (add `boxer.glb` to this folder).

## Tips

- Use a single skinned character; the scene instantiates it twice (Red Corner Fighter, Blue Corner Fighter).
- Scale is applied automatically (~1.2). Position: red corner at (-3, 0, 0), blue at (3, 0, 0).
- Materials are tinted red (player) and blue (enemy) when they support `diffuseColor` or `albedoColor`.
