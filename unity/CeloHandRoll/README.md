# GarmonPay C-Lo — Premium Hand + Physics Dice Roll (Unity)

Production-oriented module: procedural variation, synced release, rigidbody dice, face readout, camera shake.  
**Unity:** 2021.3 LTS or newer (3D, Built-in or URP — scripts are pipeline-agnostic).

---

## A. Folder structure

Copy this folder into your Unity project `Assets/`:

```text
Assets/
  GarmonPay/
    CeloHandRoll/
      GarmonPay.Celo.Dice.asmdef
      README.md
      Scripts/
        CeloDiceRollSettings.cs
        CeloRollVariation.cs
        CeloPhysicsDie.cs
        CeloWristMicroMotion.cs
        CeloRollCameraRig.cs
        CeloHandDiceRollOrchestrator.cs
      Art/                    (you create — materials, models)
      Prefabs/                (you create — HandRig, Dice, Table)
```

---

## B. Required Unity objects and components

| Object | Components |
|--------|------------|
| **Table** | `Transform`, `MeshRenderer`, `MeshFilter` (or ProBuilder mesh), `BoxCollider` (non-trigger), static body |
| **Table surface** | Optional child with `MeshCollider` (convex off) for slight curvature; else one big box |
| **Dice ×3** | `Transform`, `MeshFilter`, `MeshRenderer`, `BoxCollider`, `Rigidbody`, **`CeloPhysicsDie`** |
| **Hand rig** | `Animator` (humanoid or generic), **`CeloHandDiceRollOrchestrator`**, child bones for grip |
| **Grip slots** | Empty `Transform` children of hand bone — one per die (`_diceGripSlots`) |
| **Wrist** | Bone transform + **`CeloWristMicroMotion`** (wrist bone assigned) |
| **Camera rig** | Empty `Transform` at table + child **Main Camera** + **`CeloRollCameraRig`** (`_cameraTransform` = camera) |
| **Settings** | ScriptableObject asset **`CeloDiceRollSettings`** |

**Physics:** Project Settings → Physics: default contact offset 0.01, sleep threshold 0.005 recommended for small dice.

---

## C. Full scripts

All scripts are in `Scripts/`. Namespace: `GarmonPay.Celo.Dice`.

- **`CeloDiceRollSettings`** — tunable defaults (impulse, friction, settle, camera shake, wrist frequency).
- **`CeloRollVariation`** — per-roll randomized parameters (entry angle, shake, toss bias, torque).
- **`CeloPhysicsDie`** — kinematic in hand; impulse + torque on release; `ReadTopFaceValue(worldUp)` for pip readout.
- **`CeloWristMicroMotion`** — LateUpdate additive shake on wrist (procedural layer over Animator).
- **`CeloRollCameraRig`** — framing helpers + release shake.
- **`CeloHandDiceRollOrchestrator`** — coroutine FSM: Enter → Shake → Release physics → settle → `OnRollSettled`.

---

## D. Exact scene setup steps

1. Create **Layer** `Dice` (optional). Assign all three dice to it.
2. Create **Physic Material** `DiceFelt`: Bounciness ~0.42, Static/Dynamic friction ~0.55 / 0.52. Assign to each die’s `BoxCollider`.
3. **Dice prefab:** Scale ~0.03–0.045 unit edge (match your hand). Mass **0.012–0.03**. Drag **Rigidbody**: Collision Detection **Continuous Dynamic**, Interpolate **Interpolate**.
4. **Table:** Large box collider, layer `Default`. Tag optional `Table`.
5. **Hand model:** Import humanoid or generic rig. Add **Animator** with Controller (next section).
6. Create **three empty objects** under grip bone: `GripSlot_0`, `GripSlot_1`, `GripSlot_2`. Position dice so they sit in fingers (slight separation).
7. Place **`CeloHandDiceRollOrchestrator`** on root hand object (or dedicated “Presentation” object).
8. Assign: `_handAnimator`, `_wristMicroMotion`, `_handRoot`, `_dice[3]`, `_diceGripSlots[3]`, `_cameraRig`, `_settings` asset.
9. Set **`_worldTableUp`** to world +Y (or your table’s normal if tilted).
10. Add empty **DiceRollAnchor** at table center; at runtime call `_cameraRig.FrameWorldPoint(anchor.position, Quaternion.identity)` once, or parent camera under anchor as documented in inspector.

---

## E. Inspector settings

### `CeloDiceRollSettings` asset

| Field | Start value | Notes |
|------|-------------|--------|
| Base upward impulse | 2.0–2.6 | Increase if dice feel “weak.” |
| Upward jitter | 0.25–0.4 | Per-roll variance. |
| Lateral impulse scale | 0.35–0.55 | Sideways scatter. |
| Torque strength | 0.65–0.95 | Spin amount. |
| Per-die stagger max | 0.02–0.06 | Three-dice “cascade” release. |
| Dice bounciness / friction | see script defaults | Tune with Physic Material on collider. |
| Settle velocity threshold | 0.06–0.12 | Lower = stricter “stopped.” |
| Settle stable time | 0.3–0.5 s | Avoid reading faces while wobbling. |
| Camera shake intensity / duration | 0.1 / 0.2 | Luxury: subtle. |
| Wrist shake frequency | 3 Hz | Procedural shake layer. |
| Wrist shake amplitude | 2–4 deg | Keep subtle (casino, not cartoon). |
| Entry angle jitter | 4–8 deg | Variation on hand approach. |

### `CeloHandDiceRollOrchestrator`

- Wire all references. If **no Animator**, fallback timings use `_fallbackEnterDuration`, `_fallbackShakeDuration`, `_fallbackReleaseWindup`.
- Animator **speed** is multiplied by procedural `AnimatorSpeedMul` each roll.

### `CeloPhysicsDie` (each die)

- **`_faceOutwardNormals`**: Must match **your** mesh. For a **Unity default cube** with default UV orientation, you must **measure**: select die in scene, rotate until “1” is up, note which local axis points up, set six normals accordingly. **Calibration:** temporarily log `ReadTopFaceValue(Vector3.up)` after manual rotation, or use a small editor test.

---

## F. Animation setup instructions

1. In **Animator Controller**, create states (names must match orchestrator defaults or change serialized strings):
   - `Hand_Enter` — hand moves into frame (0.4–0.7 s).
   - `Hand_Shake` — loop or short loop (0.6–1.0 s).
   - `Hand_Release` — wrist flicks forward / fingers open (0.15–0.35 s total).
2. Transitions: **Any State** → Enter (trigger) optional; orchestrator uses `Play()` by state name — you can use default transitions from Entry to Enter if you prefer one-shot.
3. **No animation events required** — release is timed by state length + `_fallbackReleaseWindup`. For tighter sync, you can add **Animation Events** on `Hand_Release` and call a public method on orchestrator (extend script with `public void AnimEvent_Release()` that only runs `ReleaseDicePhysics()` once — use a bool guard).

**Premium tip:** Use **two layers**: Layer 0 full body, Layer 1 **additive** for subtle finger curl on a separate clip so procedural wrist layer does not fight full body.

---

## G. How to connect to your existing C-Lo game

1. **Single entry point:** From your game controller (round manager / network callback), when the server authorizes a roll:

```csharp
orchestrator.ResetDiceToGrip();
orchestrator.RequestRoll();
```

2. **Subscribe to outcome:**

```csharp
orchestrator.OnRollSettled += (int[] pips) => {
    // Map to C-Lo rules: e.g. sort, compare to banker, etc.
};
orchestrator.OnDiceReleased += () => { /* audio */ };
```

3. **Server-authoritative C-Lo:** If the **server** sends final dice values, run physics for **feel** only, then **override** display with server values (swap dice transforms to show correct faces) **after** settle — or hide physics result and show UI. This module gives **physical** outcomes; align with your netcode as needed.

4. **Web / React client:** This Unity build is **client-only**; your existing Next.js C-Lo stays the source of truth for bets — Unity is presentation when you embed or ship a desktop/mobile client.

---

## H. How to test and debug

1. **Play Mode:** Press a UI button wired to `RequestRoll()`.
2. **Console:** If faces are wrong, log `ReadTopFaceValue` per die after settle and compare to visual — fix **`_faceOutwardNormals`** on `CeloPhysicsDie`.
3. **Dice explode / tunnel:** Increase Rigidbody mass, Continuous Dynamic, reduce impulse in settings.
4. **Dice never settle:** Lower `settleVelocityThreshold` slightly or increase `settleStableTime`; check table collider is not trigger.
5. **Hand clips through table:** Raise grip slots or shorten Enter clip.

---

## I. How to make it look more premium

- **Lighting:** Area light key (warm), cool rim, very subtle purple fill — **no** flat ambient-only.
- **Table:** Dark wood or felt normal map, thin gold trim mesh, slight roughness variation (URP Lit or Built-in Standard).
- **Post:** ACES tone mapping (URP Volume), slight vignette, **no** heavy bloom on dice.
- **Color:** Deep violet `#1a0f2e`–`#2d1b4e`, gold accents `#F5C842` / `#D4A017` (match GarmonPay).
- **Motion:** Keep camera shake **subtle**; increase `wristShakeAmplitude` only slightly for drama.
- **Audio:** One-shot cloth + wood on release, faint dice clack loop during roll (optional).

---

## FINAL CHECKLIST (Cursor / engineer)

- [ ] Copy `unity/CeloHandRoll` into Unity `Assets/GarmonPay/CeloHandRoll` (or merge `Scripts` + `asmdef`).
- [ ] Let Unity compile; fix any namespace / asmdef issues.
- [ ] Create **`CeloDiceRollSettings`** asset (**Assets → Create → GarmonPay → Celo → Dice Roll Settings**).
- [ ] Build **three dice** prefabs with `Rigidbody` + `BoxCollider` + **`CeloPhysicsDie`** + Physic Material.
- [ ] **Calibrate** `_faceOutwardNormals` on each die mesh (critical for correct pip readout).
- [ ] Place **grip slot** transforms; parent dice under slots for idle pose.
- [ ] Add **`CeloWristMicroMotion`** to wrist bone; assign wrist `Transform`.
- [ ] Create **Animator Controller** with `Hand_Enter`, `Hand_Shake`, `Hand_Release` (or adjust string fields on orchestrator).
- [ ] Assign **`CeloHandDiceRollOrchestrator`** references (animator, dice, slots, settings, camera rig, hand root).
- [ ] Position **camera** with `CeloRollCameraRig.FrameWorldPoint` at start of roll or in `Start()`.
- [ ] Hook **`RequestRoll()`** from your UI / round flow; subscribe to **`OnRollSettled`**.
- [ ] Tune **impulse / torque / settle** in settings until motion feels “expensive.”
- [ ] Run **20+ rolls** in Play Mode; confirm variation (entry angle, shake, toss) changes each time.
- [ ] Optional: add **Animation Event** for exact release frame and refactor orchestrator to fire physics only from that event for maximum sync.

---

## License

Part of GarmonPay — use internally per your product license.
