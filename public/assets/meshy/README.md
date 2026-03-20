# Meshy 3D pipeline (GarmonPay)

Drop **Meshy** exports here so the app can lazy-load them as static GLBs. **Do not** commit placeholder cartoon assets — use photoreal / premium Meshy outputs.

| Folder | Contents |
|--------|----------|
| `fighters/` | Boxer character GLBs (skin weights + optional clips: `idle`, `jab`, `block`, `knockout`). |
| `rings/` | Boxing ring + canvas + posts (e.g. `arena-ring.glb`). |
| `props/` | Stools, buckets, corner pads, crowd barriers. |
| `skins/` | Outfit / glove variants referenced by URL or manifest. |

## Import checklist (production)

1. **Textures / materials** — export with embedded textures or place images next to the GLB; verify in three.js (PBR metal/roughness preserved).
2. **Scale** — app normalizes height in `CenteredMeshyModel`; in Blender, apply scale + origin at feet on floor for best results.
3. **Pivot** — origin at character feet; forward = +Z or rotate in DCC to match Y-up GLTF.
4. **Orientation** — fighters are rotated in-scene to face each other; fix in export if models face wrong axis.
5. **Performance** — run `gltf-transform optimize` / Draco / meshopt; keep textures ≤2K for web; see root docs in `public/models/README.md`.

## Fallback

If a URL 404s or fails decode, the arena shows a **neutral procedural silhouette** (not cartoon) and keeps running.
