/**
 * Server-authoritative C-Lo side-bet settlement when a round completes.
 * Wallets, fees and terminal rows settle together in the database transaction.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const CELO_SIDEBET_PAYOUT_REF = (betId: string) =>
  `celo_side_settle_payout_${betId}`;
export const CELO_SIDEBET_VOID_REF = (betId: string, party: "creator" | "acceptor") =>
  `celo_side_settle_void_${betId}_${party}`;

type PlayerRollLite = { outcome: string | null };

/** Whether the banker wins the round (main table outcome), for banker_wins / player_wins props. */
export function didBankerWinCeloRound(
  bankerDiceResult: string | null,
  playerRolls: PlayerRollLite[]
): boolean | null {
  if (!bankerDiceResult) return null;
  if (playerRolls.some((r) => r.outcome === "push")) return null;
  if (bankerDiceResult === "instant_win") return true;
  if (bankerDiceResult === "instant_loss") return false;
  if (bankerDiceResult === "point") {
    const anyPlayerWin = playerRolls.some((r) => r.outcome === "win");
    return !anyPlayerWin;
  }
  if (bankerDiceResult === "no_count") return null;
  return null;
}

function normName(name: string | null | undefined): string {
  return String(name ?? "").toUpperCase();
}

/**
 * Creator posted the proposition; acceptor took the other side.
 * Returns whether the creator wins the pot, or null = void (refund both).
 */
export function resolveSideBetCreatorWins(args: {
  betType: string;
  bankerDiceResult: string | null;
  bankerDiceName: string | null;
  playerRolls: PlayerRollLite[];
}): boolean | null {
  const { betType, bankerDiceResult, bankerDiceName, playerRolls } = args;
  if (playerRolls.some((r) => r.outcome === "push")) return null;
  const name = normName(bankerDiceName);
  const bankerOutcome = didBankerWinCeloRound(bankerDiceResult, playerRolls);

  switch (betType) {
    case "banker_wins": {
      if (bankerOutcome === null) return null;
      return bankerOutcome;
    }
    case "player_wins": {
      if (bankerOutcome === null) return null;
      return !bankerOutcome;
    }
    case "celo": {
      if (bankerDiceResult !== "instant_win") return false;
      return name.includes("C-LO");
    }
    case "shit": {
      if (bankerDiceResult !== "instant_loss") return false;
      return (
        name.includes("SHIT") ||
        name.includes("DICK") ||
        name.includes("DICE") ||
        name.includes("ACE-DEUCE-TREY")
      );
    }
    case "trips": {
      if (bankerDiceResult !== "instant_win") return false;
      return name.includes("TRIP") || name.includes("ACE OUT");
    }
    case "hand_crack": {
      if (bankerDiceResult !== "instant_win") return false;
      return name.includes("HAND CRACK");
    }
    default:
      return null;
  }
}

/** Database settles side entries inside the main-table transaction. This retries legacy completions safely. */
export async function runCeloSideBetSettlementAfterRoundComplete(admin:SupabaseClient,roomId:string,roundId:string,_platformFeePct:number):Promise<void>{
 const {error}=await admin.rpc('celo_settle_sidebets_atomic',{p_room:roomId,p_round:roundId});if(error)throw new Error(error.message);
}
