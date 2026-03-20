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
    .select(
      "id, fighter_a_id, fighter_b_id, cpu_fighter_id, winner_id, winner_cpu_fighter_id, betting_open, fight_type, created_at"
    )
    .eq("id", fightId)
    .single();
  if (fightErr || !fight) {
    return NextResponse.json({ message: "Fight not found" }, { status: 404 });
  }

  const { data: fa } = await supabase
    .from("arena_fighters")
    .select("id, name, style, avatar, strength, speed, stamina, defense, chin, special, model_3d_url")
    .eq("id", fight.fighter_a_id)
    .maybeSingle();

  let fb = null;
  if (fight.fighter_b_id) {
    const { data: arenaB } = await supabase
      .from("arena_fighters")
      .select("id, name, style, avatar, strength, speed, stamina, defense, chin, special, model_3d_url")
      .eq("id", fight.fighter_b_id)
      .maybeSingle();
    fb = arenaB ?? null;
  } else if ((fight as { cpu_fighter_id?: string }).cpu_fighter_id) {
    const { data: cpu } = await supabase
      .from("cpu_fighters")
      .select("id, name, style, avatar, strength, speed, stamina, defense, chin, special, difficulty")
      .eq("id", (fight as { cpu_fighter_id: string }).cpu_fighter_id)
      .maybeSingle();
    if (cpu) {
      fb = {
        ...cpu,
        model_3d_url: null as string | null,
      };
    }
  }

  return NextResponse.json({
    fight: {
      id: fight.id,
      fightType: fight.fight_type,
      bettingOpen: (fight as { betting_open?: boolean }).betting_open !== false,
      winnerId: (fight as { winner_id?: string }).winner_id ?? null,
      winnerCpuFighterId: (fight as { winner_cpu_fighter_id?: string }).winner_cpu_fighter_id ?? null,
      createdAt: (fight as { created_at?: string }).created_at,
    },
    fighterA: fa ?? null,
    fighterB: fb,
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

  const { data: cpuWin } = await supabase.from("cpu_fighters").select("id").eq("id", winnerId).maybeSingle();
  const patch =
    cpuWin != null
      ? { winner_id: null as string | null, winner_cpu_fighter_id: winnerId, betting_open: false }
      : { winner_id: winnerId, winner_cpu_fighter_id: null as string | null, betting_open: false };

  const { error: updateErr } = await supabase.from("arena_fights").update(patch).eq("id", fightId);
  if (updateErr) {
    return NextResponse.json({ message: updateErr.message }, { status: 500 });
  }

  // Process spectator bet payouts (column is bet_on, not bet_on_fighter_id)
  const { data: bets } = await supabase
    .from("arena_spectator_bets")
    .select("id, user_id, amount, bet_on, odds")
    .eq("fight_id", fightId)
    .eq("payout_processed", false);

  if (bets && bets.length > 0) {
    for (const bet of bets) {
      const betOn = (bet as { bet_on: string }).bet_on;
      if (betOn === winnerId) {
        const betAmount = Number((bet as { amount: number }).amount);
        const odds = Number((bet as { odds?: number }).odds ?? 1.9);
        const payout = Math.max(1, Math.floor(betAmount * odds));
        // Add payout to bettor's arena_coins (stored on users table)
        const { error: rpcErr } = await supabase.rpc("increment_arena_coins", {
          p_user_id: (bet as { user_id: string }).user_id,
          p_amount: payout,
        });
        if (rpcErr) {
          // Fallback: manual increment on users.arena_coins if rpc not available
          const { data: userRow } = await supabase
            .from("users")
            .select("id, arena_coins")
            .eq("id", (bet as { user_id: string }).user_id)
            .maybeSingle();
          if (userRow) {
            const currentCoins = Number((userRow as { arena_coins?: number }).arena_coins ?? 0);
            await supabase
              .from("users")
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
