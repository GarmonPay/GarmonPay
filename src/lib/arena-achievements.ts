/**
 * Arena achievements (coin rewards) and weight classes for matchmaking.
 */

export const WEIGHT_CLASSES = [
  { name: "Lightweight", min: 0, max: 319 },
  { name: "Middleweight", min: 320, max: 420 },
  { name: "Heavyweight", min: 421, max: 520 },
  { name: "Unlimited", min: 521, max: 9999 },
] as const;

export function getWeightClass(totalStats: number): string {
  for (const w of WEIGHT_CLASSES) {
    if (totalStats >= w.min && totalStats <= w.max) return w.name;
  }
  return "Unlimited";
}

export function getTotalStats(fighter: { strength?: number; speed?: number; stamina?: number; defense?: number; chin?: number; special?: number }): number {
  return (
    Number(fighter.strength ?? 0) +
    Number(fighter.speed ?? 0) +
    Number(fighter.stamina ?? 0) +
    Number(fighter.defense ?? 0) +
    Number(fighter.chin ?? 0) +
    Number(fighter.special ?? 0)
  );
}

export type AchievementKey =
  | "first_win"
  | "wins_5"
  | "wins_10"
  | "wins_25"
  | "training_5"
  | "training_20"
  | "streak_3"
  | "streak_5"
  | "streak_10";

export const ACHIEVEMENT_DEFINITIONS: Record<
  AchievementKey,
  { name: string; coins: number; check: (ctx: { wins: number; losses: number; training_sessions: number; win_streak: number }) => boolean }
> = {
  first_win: { name: "First Victory", coins: 25, check: (c) => c.wins >= 1 },
  wins_5: { name: "Five Wins", coins: 50, check: (c) => c.wins >= 5 },
  wins_10: { name: "Ten Wins", coins: 100, check: (c) => c.wins >= 10 },
  wins_25: { name: "Veteran", coins: 250, check: (c) => c.wins >= 25 },
  training_5: { name: "Dedicated", coins: 30, check: (c) => c.training_sessions >= 5 },
  training_20: { name: "Gym Rat", coins: 100, check: (c) => c.training_sessions >= 20 },
  streak_3: { name: "On Fire (3)", coins: 40, check: (c) => c.win_streak >= 3 },
  streak_5: { name: "On Fire (5)", coins: 75, check: (c) => c.win_streak >= 5 },
  streak_10: { name: "Unstoppable", coins: 150, check: (c) => c.win_streak >= 10 },
};

export const ACHIEVEMENT_KEYS = Object.keys(ACHIEVEMENT_DEFINITIONS) as AchievementKey[];
