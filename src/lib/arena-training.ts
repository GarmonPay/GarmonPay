/**
 * GARMONPAY ARENA — Training Gym config and helpers.
 * 6 sessions; stats cap at 99; style evolution on wins (not here); signature moves on stat thresholds.
 */

export const STAT_CAP = 99;

export type TrainingSessionKey =
  | "heavy_bag"
  | "speed_drills"
  | "roadwork"
  | "defense_mitts"
  | "war_sparring"
  | "combo_lab";

export interface TrainingSessionConfig {
  key: TrainingSessionKey;
  name: string;
  stat: "strength" | "speed" | "stamina" | "defense" | "chin" | "special";
  minGain: number;
  maxGain: number;
  priceCents: number;
  /** Minimum total training_sessions completed before this session is available. */
  requiredSessions: number;
}

export const TRAINING_SESSIONS: TrainingSessionConfig[] = [
  { key: "heavy_bag", name: "Heavy Bag", stat: "strength", minGain: 3, maxGain: 7, priceCents: 6000, requiredSessions: 0 },
  { key: "speed_drills", name: "Speed Drills", stat: "speed", minGain: 3, maxGain: 7, priceCents: 6000, requiredSessions: 0 },
  { key: "roadwork", name: "5AM Roadwork", stat: "stamina", minGain: 3, maxGain: 7, priceCents: 6000, requiredSessions: 0 },
  { key: "defense_mitts", name: "Defense Mitts", stat: "defense", minGain: 3, maxGain: 6, priceCents: 8000, requiredSessions: 0 },
  { key: "war_sparring", name: "War Sparring", stat: "chin", minGain: 2, maxGain: 5, priceCents: 10000, requiredSessions: 2 },
  { key: "combo_lab", name: "Combo Lab", stat: "special", minGain: 2, maxGain: 4, priceCents: 12000, requiredSessions: 3 },
];

/** Signature move unlock thresholds (stat must be >= value). */
export const SIGNATURE_MOVE_THRESHOLDS: Record<string, { stat?: string; stats?: string[]; min?: number }> = {
  THE_HAYMAKER: { stat: "strength", min: 70 },
  COUNTER_HOOK: { stat: "defense", min: 65 },
  BODY_BREAKER: { stat: "stamina", min: 65 },
  FLASH_KO: { stat: "speed", min: 75 },
  IRON_WILL: { stat: "chin", min: 70 },
  THE_FINAL_ROUND: { stats: ["strength", "speed", "stamina"], min: 60 },
};

export type SignatureMoveKey = keyof typeof SIGNATURE_MOVE_THRESHOLDS;

export function getSessionByKey(key: string): TrainingSessionConfig | undefined {
  return TRAINING_SESSIONS.find((s) => s.key === key);
}

export function isSessionUnlocked(requiredSessions: number, completedSessions: number): boolean {
  return completedSessions >= requiredSessions;
}

/** Random gain in [min, max] inclusive. */
export function randomGain(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Check which signature moves are unlocked by current stats (before update). Returns keys that are now unlocked. */
export function checkSignatureUnlocks(stats: Record<string, number>): SignatureMoveKey[] {
  const unlocked: SignatureMoveKey[] = [];
  for (const [key, config] of Object.entries(SIGNATURE_MOVE_THRESHOLDS)) {
    if (config.stat && typeof stats[config.stat] === "number" && stats[config.stat] >= (config.min ?? 0)) {
      unlocked.push(key as SignatureMoveKey);
    } else if (config.stats && config.stats.every((s) => (stats[s] ?? 0) >= (config.min ?? 0))) {
      unlocked.push(key as SignatureMoveKey);
    }
  }
  return unlocked;
}

/** Style evolution is based on wins (0, 2, 7, 15). Applied when wins update (e.g. after a fight). */
export const STYLE_EVOLUTION_WINS = [0, 2, 7, 15] as const;

export function getStyleStage(wins: number): 0 | 1 | 2 | 3 {
  if (wins >= 15) return 3;
  if (wins >= 7) return 2;
  if (wins >= 2) return 1;
  return 0;
}
