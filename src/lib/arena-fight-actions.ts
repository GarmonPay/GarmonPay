/**
 * Arena tap-to-punch actions and server-side resolution.
 * Client sends one of these; server resolves damage (client never calculates).
 */

export const ARENA_ACTIONS = [
  "JAB",
  "RIGHT_HAND",
  "HOOK",
  "BODY_SHOT",
  "DODGE_LEFT",
  "DODGE_RIGHT",
  "BLOCK",
  "SPECIAL",
] as const;

export type ArenaActionType = (typeof ARENA_ACTIONS)[number];

const PUNCH_ACTIONS: ArenaActionType[] = ["JAB", "RIGHT_HAND", "HOOK", "BODY_SHOT", "SPECIAL"];

/** Base power per action (before stat scaling). */
export const ACTION_BASE_POWER: Record<ArenaActionType, number> = {
  JAB: 8,
  RIGHT_HAND: 14,
  HOOK: 18,
  BODY_SHOT: 12,
  DODGE_LEFT: 0,
  DODGE_RIGHT: 0,
  BLOCK: 0,
  SPECIAL: 22,
};

/** Style tendencies: weight per action (higher = CPU picks more often). */
export const STYLE_TENDENCIES: Record<string, Partial<Record<ArenaActionType, number>>> = {
  Brawler: { HOOK: 3, RIGHT_HAND: 2.5, BODY_SHOT: 1.5, JAB: 1, BLOCK: 0.8 },
  Boxer: { JAB: 3, RIGHT_HAND: 2, DODGE_LEFT: 1.2, DODGE_RIGHT: 1.2, BLOCK: 1 },
  Slugger: { RIGHT_HAND: 2.5, HOOK: 2.5, SPECIAL: 1.5, BODY_SHOT: 1.2 },
  Counterpuncher: { BLOCK: 2, DODGE_LEFT: 1.5, DODGE_RIGHT: 1.5, JAB: 1.5, RIGHT_HAND: 1.2 },
  Swarmer: { JAB: 2.5, BODY_SHOT: 2, HOOK: 1.5, DODGE_LEFT: 1, DODGE_RIGHT: 1 },
  Technician: { JAB: 2, RIGHT_HAND: 1.5, BLOCK: 1.5, DODGE_LEFT: 1.2, DODGE_RIGHT: 1.2, SPECIAL: 1 },
};

export interface FighterStats {
  strength: number;
  speed: number;
  stamina: number;
  defense: number;
  chin: number;
  special: number;
}

export interface ExchangeResult {
  actionA: ArenaActionType;
  actionB: ArenaActionType;
  damageAtoB: number;
  damageBtoA: number;
  healthA: number;
  healthB: number;
  hitA: boolean; // true if B took damage from A
  hitB: boolean; // true if A took damage from B
}

const INITIAL_HEALTH = 100;

export function getInitialHealth(): number {
  return INITIAL_HEALTH;
}

/** Pick a CPU action based on style (tendencies). */
export function pickCpuAction(style: string): ArenaActionType {
  const weights = STYLE_TENDENCIES[style] ?? {};
  const entries = ARENA_ACTIONS.filter((a) => PUNCH_ACTIONS.includes(a) || a === "BLOCK" || a === "DODGE_LEFT" || a === "DODGE_RIGHT").map(
    (action) => [action, (weights[action] ?? 1) as number] as const
  );
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [action, w] of entries) {
    r -= w;
    if (r <= 0) return action;
  }
  return "JAB";
}

/** Resolve one exchange: both sides chose an action. Server-only. */
export function resolveExchange(
  actionA: ArenaActionType,
  actionB: ArenaActionType,
  statsA: FighterStats,
  statsB: FighterStats,
  healthA: number,
  healthB: number
): ExchangeResult {
  const damageAtoB = computeDamage(actionA, actionB, statsA, statsB, "B");
  const damageBtoA = computeDamage(actionB, actionA, statsB, statsA, "A");
  const hitA = damageAtoB > 0;
  const hitB = damageBtoA > 0;
  return {
    actionA,
    actionB,
    damageAtoB,
    damageBtoA,
    healthA: Math.max(0, healthA - damageBtoA),
    healthB: Math.max(0, healthB - damageAtoB),
    hitA,
    hitB,
  };
}

function computeDamage(
  attack: ArenaActionType,
  defend: ArenaActionType,
  attacker: FighterStats,
  defender: FighterStats,
  _targetSide: "A" | "B"
): number {
  if (!PUNCH_ACTIONS.includes(attack)) return 0;
  const base = ACTION_BASE_POWER[attack];
  const statScale = (attacker.strength * 0.4 + attacker.speed * 0.2 + attacker.special * 0.15) / 50;
  let damage = base * (0.8 + statScale * 0.4);
  if (defend === "BLOCK") damage *= 0.5;
  if (defend === "DODGE_LEFT" || defend === "DODGE_RIGHT") {
    const dodgeChance = 0.2 + (defender.speed / 99) * 0.3;
    if (Math.random() < dodgeChance) damage = 0;
    else damage *= 0.7;
  }
  const defenseReduce = 1 - (defender.defense / 99) * 0.25;
  damage *= defenseReduce;
  const chinReduce = 1 - (defender.chin / 99) * 0.15;
  damage *= chinReduce;
  return Math.round(Math.max(0, damage));
}
