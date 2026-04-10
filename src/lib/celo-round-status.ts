/**
 * `public.celo_rounds.status` — values must match the database CHECK exactly.
 *
 * Source of truth: `supabase/migrations/20260329150000_celo_street_dice.sql`
 *   `CHECK (status IN ('betting', 'banker_rolling', 'player_rolling', 'completed'))`
 *
 * No later migration redefines this constraint; do not invent new round statuses in app code.
 */
export const CELO_ROUND_STATUS = {
  betting: "betting",
  banker_rolling: "banker_rolling",
  player_rolling: "player_rolling",
  completed: "completed",
} as const;

export type CeloRoundStatus = (typeof CELO_ROUND_STATUS)[keyof typeof CELO_ROUND_STATUS];
