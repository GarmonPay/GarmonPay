/**
 * Presentation-only throw geometry.
 * Dice values are never chosen here. Callers pass the server triplet through.
 */

export const STREET_TABLE_PX = { width: 576, height: 1024 } as const;

/**
 * Inner black felt of garmonpay-ceelo-environment.jpg, inside the gold rails.
 * The padded armrest below the near rail is not part of the playing surface.
 * Coordinates are source-image pixels, not a single viewport.
 */
export const FELT_IMAGE_RECT = {
  left: 72,
  top: 535,
  right: 504,
  bottom: 688,
} as const;

/** Hand enters, shakes, then opens. Presentation timing only. */
export const CELO_HAND_ENTER_MS = 280;
export const CELO_HAND_SHAKE_MS = 860;
export const CELO_HAND_RELEASE_MS = 200;
/** Dice flight after the hand opens. The last die is delayed by CELO_THROW_TAIL_MS. */
export const CELO_THROW_MS = 1200;
export const CELO_THROW_TAIL_MS = 260;
export const CELO_THROW_SETTLE_MS = CELO_HAND_RELEASE_MS + CELO_THROW_MS + CELO_THROW_TAIL_MS;
export const CELO_THROW_REDUCED_MS = 420;

export const HAND_TONES = ["dark", "medium-dark", "medium", "light-medium", "light"] as const;
export type HandTone = (typeof HAND_TONES)[number];

/**
 * Stable index for a presentation seed. Used only to pick a hand asset.
 * It is not a game result and it does not describe the player.
 */
export function handToneIndex(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % HAND_TONES.length;
}

/**
 * One hand per shooter for the whole session.
 * The same id always returns the same asset, including across re-renders and
 * repeated rolls. A different shooter gets a different asset while one is free.
 * This is presentation only. It is not tied to a name, wallet, or profile.
 */
const shooterHands = new Map<string, HandTone>();

export function handForShooter(shooterId: string): HandTone {
  const key = shooterId.trim() || "table";
  const saved = shooterHands.get(key);
  if (saved) return saved;
  const used = new Set(shooterHands.values());
  let index = handToneIndex(`shooter:${key}`);
  let tone = HAND_TONES[index] ?? "medium";
  if (used.has(tone)) {
    for (let step = 1; step <= HAND_TONES.length; step++) {
      const next = HAND_TONES[(index + step) % HAND_TONES.length] ?? "medium";
      if (!used.has(next)) {
        tone = next;
        break;
      }
    }
  }
  shooterHands.set(key, tone);
  return tone;
}

export function clearShooterHands(): void {
  shooterHands.clear();
}

export function handAsset(kind: "hold" | "shake" | "release", tone: HandTone): string {
  return `/images/celo/throw/hand-${kind}-${tone}.png`;
}

/** Resting tilts. Each path family lands a few degrees apart. Faces do not change. */
export const CELO_REST_TILTS: readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
] = [
  [-11, 7, 14],
  [-7, 11, 18],
  [9, -6, 12],
];

const TUMBLE_CYCLE = [2, 5, 1, 6, 3, 4] as const;

export type FeltBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function readObjectPositionY(objectPosition: string): number {
  const parts = objectPosition.trim().split(/\s+/);
  const raw = parts[1] ?? parts[0] ?? "62%";
  if (raw.endsWith("%")) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n / 100));
  }
  return 0.7;
}

/** Fractions of the stage. The box scales with the stage; it is not a 390px constant. */
export function projectFeltPlay(
  stageW: number,
  stageH: number,
  objectPositionY = 0.7
): FeltBox {
  const { width: imgW, height: imgH } = STREET_TABLE_PX;
  const scale = Math.max(stageW / imgW, stageH / imgH);
  const offsetX = (stageW - imgW * scale) * 0.5;
  const offsetY = (stageH - imgH * scale) * objectPositionY;
  let x1 = offsetX + FELT_IMAGE_RECT.left * scale;
  let y1 = offsetY + FELT_IMAGE_RECT.top * scale;
  let x2 = offsetX + FELT_IMAGE_RECT.right * scale;
  let y2 = offsetY + FELT_IMAGE_RECT.bottom * scale;
  x1 = Math.max(0, x1);
  y1 = Math.max(0, y1);
  x2 = Math.min(stageW, x2);
  y2 = Math.min(stageH, y2);
  const padX = stageW * 0.015;
  const padY = stageH * 0.02;
  x1 += padX;
  y1 += padY;
  x2 -= padX;
  y2 -= padY;
  return {
    left: x1 / stageW,
    top: y1 / stageH,
    width: Math.max(0, x2 - x1) / stageW,
    height: Math.max(0, y2 - y1) / stageH,
  };
}

/** The faces shown after the throw. Always the server triplet, unchanged. */
export function settledDiceFaces(
  server: readonly [number, number, number]
): [number, number, number] {
  return [server[0], server[1], server[2]];
}

/**
 * A face shown while the die is still moving.
 * This is a fixed cycle so the tumble is not readable as the result.
 */
export function visualTumbleFace(lane: number, tick: number): number {
  const index = Math.abs(lane * 2 + tick) % TUMBLE_CYCLE.length;
  return TUMBLE_CYCLE[index]!;
}

export function displayedDieFace(
  serverValue: number | null,
  throwing: boolean,
  lane: number,
  tick: number
): number | null {
  if (throwing) return visualTumbleFace(lane, tick);
  return serverValue;
}

/** Path family for this throw. Does not change the settled faces. */
export function throwVariant(seed: string): 0 | 1 | 2 {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % 3) as 0 | 1 | 2;
}
