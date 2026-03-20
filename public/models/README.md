# Arena 3D models (committed for Vercel)

These **`.glb` files are tracked in Git** so `garmonpay.com` can serve them as static assets (e.g. `https://garmonpay.com/models/default-boxer.glb`).

**Meshy pipeline:** drop additional exports under `public/assets/meshy/` (see `public/assets/meshy/README.md`). Optional ring: set `NEXT_PUBLIC_MESHY_RING_GLB=/assets/meshy/rings/your-ring.glb`. Draco-compressed fighters: set `NEXT_PUBLIC_MESHY_DRACO=1`.

| File | Purpose |
|------|---------|
| `default-boxer.glb` | **ProBoxer** — photorealistic boxer (`/models/default-boxer.glb`) |
| `boxing-ring.glb` | Optional ring asset |
| `boxing-ring_.glb` | Alternate/large ring variant |

Do **not** add `*.glb` to `.gitignore` if you need production 3D to load.

---

## Legacy: animated boxer for fight arena

If you use a skinned `boxer.glb` with clips:

| Name | Use | Loop |
|------|-----|------|
| `idle` | Standing | Yes |
| `jab` | Jab | No |
| `powerPunch` | Power punch | No |
| `block` | Block | No |
| `knockout` | KO | No |

Red corner ~(-3,0,0), blue ~(3,0,0).
