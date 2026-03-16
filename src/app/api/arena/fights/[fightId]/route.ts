import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { advanceTournamentBracket } from "@/lib/arena-tournaments";

/** GET /api/arena/fights/[fightId] — get one fight (for spectator watch page). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ fightId: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { fightId } = await params;
  if (!fightId) {
    return NextResponse.json({ message: "fightId required" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data: fight, error: fightErr } = await supabase
    .from("arena_fights")
    .select("id, fighter_a_id, fighter_b_id, winner_id, betting_open, fight_type, created_at")
    .eq("id", fightId)
    .single();
  if (fightErr || !fight) {
    return NextResponse.json({ message: "Fight not found" }, { status: 404 });
  }
  const { data: fighters } = await supabase
    .from("arena_fighters")
    .select("id, name, style, avatar, strength, speed, stamina, defense, chin, special")
    .in("id", [fight.fighter_a_id, fight.fighter_b_id]);
  const fa = fighters?.find((f) => f.id === fight.fighter_a_id);
  const fb = fighters?.find((f) => f.id === fight.fighter_b_id);
  return NextResponse.json({
    fight: {
      id: fight.id,
      fightType: fight.fight_type,
      bettingOpen: (fight as { betting_open?: boolean }).betting_open !== false,
      winnerId: (fight as { winner_id?: string }).winner_id ?? null,
      createdAt: (fight as { created_at?: string }).created_at,
    },
    fighterA: fa ?? null,
    fighterB: fb ?? null,
  });
}

/** PATCH /api/arena/fights/[fightId] — record fight outcome (winner), process bet payouts, advance tournament bracket. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ fightId: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { fightId } = await params;
  if (!fightId) {
    return NextResponse.json({ message: "fightId required" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { winnerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const winnerId = body.winnerId;
  if (!winnerId || typeof winnerId !== "string") {
    return NextResponse.json({ message: "winnerId required" }, { status: 400 });
  }

  // Record fight result
  const { error: updateErr } = await supabase
    .from("arena_fights")
    .update({ winner_id: winnerId, betting_open: false, ended_at: new Date().toISOString() })
    .eq("id", fightId);
  if (updateErr) {
    return NextResponse.json({ message: updateErr.message }, { status: 500 });
  }

  // Process spectator bet payouts
  const { data: bets } = await supabase
    .from("arena_spectator_bets")
    .select("id, user_id, amount, bet_on_fighter_id, odds")
    .eq("fight_id", fightId)
    .eq("payout_processed", false);

  if (bets && bets.length > 0) {
    for (const bet of bets) {
      if ((bet as { bet_on_fighter_id: string }).bet_on_fighter_id === winnerId) {
        const betAmount = Number((bet as { amount: number }).amount);
        const odds = Number((bet as { odds?: number }).odds ?? 1.9);
        const payout = Math.max(1, Math.floor(betAmount * odds));
        // Add payout to bettor's arena_coins
        const { error: rpcErr } = await supabase.rpc("increment_arena_coins", {
          p_user_id: (bet as { user_id: string }).user_id,
          p_amount: payout,
        });
        if (rpcErr) {
          // Fallback: manual increment if rpc not available
          const { data: userRow } = await supabase
            .from("arena_fighters")
            .select("id, arena_coins")
            .eq("user_id", (bet as { user_id: string }).user_id)
            .maybeSingle();
          if (userRow) {
            const currentCoins = Number((userRow as { arena_coins?: number }).arena_coins ?? 0);
            await supabase
              .from("arena_fighters")
              .update({ arena_coins: currentCoins + payout })
              .eq("id", (userRow as { id: string }).id);
          }
        }
      }
      // Mark bet as processed
      await supabase
        .from("arena_spectator_bets")
        .update({ payout_processed: true })
        .eq("id", (bet as { id: string }).id);
    }
  }

  // Check if this is a tournament fight and advance bracket
  const { data: fightRow } = await supabase
    .from("arena_fights")
    .select("tournament_id, round")
    .eq("id", fightId)
    .single();
  if (fightRow?.tournament_id) {
    await advanceTournamentBracket(supabase, fightRow.tournament_id, fightId, winnerId);
  }

  return NextResponse.json({ success: true, fightId, winnerId });
}
