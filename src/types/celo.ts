/** C-Lo domain types aligned with `celo_*` tables (sweeps / SC language). */

export type CeloRoom = {
  id: string;
  name: string;
  creator_id: string;
  banker_id: string;
  status: string;
  room_type: string;
  join_code: string | null;
  minimum_entry_sc: number;
  current_bank_sc: number;
  total_rounds: number;
  created_at: string;
  last_activity: string;
  max_players: number;
  last_round_was_celo: boolean;
  banker_celo_at: string | null;
  platform_fee_pct: number;
  max_bet_cents: number;
  current_bank_cents: number;
  banker_reserve_sc: number;
  no_short_stop: boolean;
  banker?: {
    id: string;
    full_name: string;
    email: string;
  };
};

export type CeloPlayer = {
  id: string;
  room_id: string;
  user_id: string;
  role: "banker" | "player" | "spectator";
  seat_number: number;
  entry_sc: number;
  dice_type: string;
  dice_quantity: number;
  dice_expires_at: string | null;
  joined_at: string;
  user?: {
    id: string;
    full_name: string;
    email: string;
  };
};

export type CeloRound = {
  id: string;
  room_id: string;
  round_number: number;
  banker_id: string;
  status: string;
  banker_dice: number[] | null;
  banker_roll_name: string | null;
  banker_roll_result: string | null;
  banker_point: number | null;
  current_player_seat?: number | null;
  prize_pool_sc: number;
  platform_fee_sc: number;
  banker_winnings_sc: number;
  bank_covered: boolean;
  covered_by: string | null;
  created_at: string;
  completed_at: string | null;
  /** Server roll lock — true while POST /roll is mutating this round */
  roll_processing?: boolean;
  roller_user_id?: string | null;
  roll_animation_start_at?: string | null;
  roll_animation_duration_ms?: number | null;
  updated_at?: string | null;
};

/** Latest row from `celo_player_rolls` for the active round (server truth for player dice). */
export type CeloLatestPlayerRoll = {
  id: string;
  round_id: string;
  room_id: string;
  user_id: string;
  dice: number[];
  roll_name: string;
  roll_result: string;
  outcome: string;
  created_at: string;
  roll_animation_start_at?: string | null;
  roll_animation_duration_ms?: number | null;
};

export type CeloSideBet = {
  id: string;
  room_id: string;
  round_id: string | null;
  creator_id: string;
  acceptor_id: string | null;
  bet_type: string;
  target_player_id: string | null;
  specific_point: number | null;
  amount_sc: number;
  odds_multiplier: number;
  status: string;
  winner_id: string | null;
  platform_fee_sc: number;
  payout_sc: number;
  expires_at: string;
  created_at: string;
  settled_at: string | null;
  creator?: {
    full_name: string;
  };
};

export type CeloMessage = {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  is_system: boolean;
  created_at: string;
  user?: {
    full_name: string;
  };
  /** Snapshot / API convenience */
  user_name?: string;
};

export type CeloRoll = {
  id: string;
  round_id: string;
  room_id: string;
  user_id: string;
  dice: number[];
  roll_name: string;
  roll_result: string;
  point: number | null;
  entry_sc: number;
  outcome: string;
  payout_sc: number;
  reroll_count: number;
  created_at: string;
};

export type CeloDiceType = "standard" | "gold" | "diamond" | "blood" | "street" | "midnight" | "fire";
