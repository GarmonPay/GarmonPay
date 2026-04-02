import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import { rollThreeDice, evaluateRoll, comparePoints } from "@/lib/celo-engine";

// ── HELPERS ────────────────────────────────────────────────────────────────────

type SupabaseClient = NonNullable<ReturnType<typeof createAdminClient>>;

/** Returns the next player who hasn't resolved their roll in this round. */
async function getNextPlayer(
  supabase: SupabaseClient,
  roomId: string,
  roundId: string,
  coveredBy: string | null
): Promise<{ user_id: string; bet_cents: number; seat_number: number } | null> {
  // Build player query — if bank_covered only the covering player rolls
  let playerQuery = supabase
    .from("celo_room_players")
    .select("user_id, bet_cents, seat_number")
    .eq("room_id", roomId)
    .eq("role", "player")
    .order("seat_number", { ascending: true });

  if (coveredBy) {
    playerQuery = playerQuery.eq("user_id", coveredBy);
  }

  const { data: players } = await playerQuery;

  if (!players || players.length === 0) return null;

  // Find players who have already resolved (outcome = win or loss)
  const { data: resolvedRolls } = await supabase
    .from("celo_player_rolls")
    .select("user_id")
    .eq("round_id", roundId)
    .in("outcome", ["win", "loss"]);

  const resolvedIds = new Set(
    (resolvedRolls ?? []).map((r: { user_id: string }) => r.user_id)
  );

  const next = (
    players as { user_id: string; bet_cents: number; seat_number: number }[]
  ).find((p) => !resolvedIds.has(p.user_id));

  return next ?? null;
}

/** Get the latest reroll_count for a player in this round. */
async function getPlayerRerollCount(
  supabase: SupabaseClient,
  roundId: string,
  userId: string
): Promise<number> {
  const { data } = await supabase
    .from("celo_player_rolls")
    .select("reroll_count")
    .eq("round_id", roundId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return 0;
  return (data as { reroll_count?: number }).reroll_count ?? 0;
}

/** Check if all players have resolved rolls; if so, complete the round. */
async function checkAndCompleteRound(
  supabase: SupabaseClient,
  roomId: string,
  roundId: string,
  coveredBy: string | null
): Promise<boolean> {
  let playerQuery = supabase
    .from("celo_room_players")
    .select("user_id")
    .eq("room_id", roomId)
    .eq("role", "player");

  if (coveredBy) {
    playerQuery = playerQuery.eq("user_id", coveredBy);
  }

  const { data: allPlayers } = await playerQuery;
  const totalPlayers = allPlayers?.length ?? 0;
  if (totalPlayers === 0) return false;

  const { count: resolvedCount } = await supabase
    .from("celo_player_rolls")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId)
    .in("outcome", ["win", "loss"]);

  return (resolvedCount ?? 0) >= totalPlayers;
}

/** Settle open side bets for a completed round. */
async function settleOpenSideBets(
  supabase: SupabaseClient,
  roundId: string,
  roomId: string
) {
  const { data: openBets } = await supabase
    .from("celo_side_bets")
    .select("*")
    .eq("round_id", roundId)
    .in("status", ["open", "matched", "locked"]);

  if (!openBets || openBets.length === 0) return;

  for (const bet of openBets as {
    id: string;
    creator_id: string;
    acceptor_id: string | null;
    amount_cents: number;
    status: string;
  }[]) {
    if (bet.status === "open") {
      // No acceptor — refund creator
      await walletLedgerEntry(
        bet.creator_id,
        "game_win",
        bet.amount_cents,
        `celo_sidebet_refund_${bet.id}`
      );
      await supabase
        .from("celo_side_bets")
        .update({ status: "cancelled", settled_at: new Date().toISOString() })
        .eq("id", bet.id);
    } else if (bet.acceptor_id) {
      // Matched but unresolved — refund both sides
      await Promise.all([
        walletLedgerEntry(
          bet.creator_id,
          "game_win",
          bet.amount_cents,
          `celo_sidebet_refund_${bet.id}_creator`
        ),
        walletLedgerEntry(
          bet.acceptor_id,
          "game_win",
          bet.amount_cents,
          `celo_sidebet_refund_${bet.id}_acceptor`
        ),
      ]);
      await supabase
        .from("celo_side_bets")
        .update({ status: "cancelled", settled_at: new Date().toISOString() })
        .eq("id", bet.id);
    }
  }
}

// ── ROUTE HANDLER ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { room_id, round_id } = body as { room_id?: string; round_id?: string };
  if (!room_id || !round_id) {
    return NextResponse.json({ error: "room_id and round_id required" }, { status: 400 });
  }

  // Verify user is in this room
  const { data: playerEntry } = await supabase
    .from("celo_room_players")
    .select("role, bet_cents, seat_number")
    .eq("room_id", room_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!playerEntry) {
    return NextResponse.json({ error: "Not in this room" }, { status: 403 });
  }

  // Fetch round
  const { data: round } = await supabase
    .from("celo_rounds")
    .select("*")
    .eq("id", round_id)
    .eq("room_id", room_id)
    .maybeSingle();

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const r = round as {
    id: string;
    status: string;
    banker_id: string;
    banker_point: number | null;
    banker_rerolls: number;
    total_pot_cents: number;
    platform_fee_cents: number;
    bank_covered: boolean;
    covered_by: string | null;
    completed_at: string | null;
  };

  if (r.completed_at || r.status === "completed") {
    return NextResponse.json({ error: "Round is already completed" }, { status: 400 });
  }

  // Fetch room
  const { data: room } = await supabase
    .from("celo_rooms")
    .select("banker_id, current_bank_cents, platform_fee_pct")
    .eq("id", room_id)
    .single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const rm = room as {
    banker_id: string;
    current_bank_cents: number;
    platform_fee_pct: number;
  };

  const now = new Date().toISOString();

  // ── BANKER ROLL ────────────────────────────────────────────────────────────

  if (r.status === "banker_rolling") {
    if (userId !== rm.banker_id) {
      return NextResponse.json({ error: "Not your turn to roll" }, { status: 403 });
    }

    const dice = rollThreeDice();
    const roll = evaluateRoll(dice);
    const feePct = rm.platform_fee_pct;

    // Always record the banker's roll in audit
    await supabase.from("celo_audit_log").insert({
      room_id,
      round_id,
      user_id: userId,
      action: "banker_rolled",
      details: { dice, roll_name: roll.rollName, result: roll.result, is_celo: roll.isCelo },
    });

    // ── NO COUNT ──
    if (roll.result === "no_count") {
      await supabase
        .from("celo_rounds")
        .update({
          banker_roll: dice,
          banker_roll_name: roll.rollName,
          banker_roll_result: roll.result,
          banker_rerolls: r.banker_rerolls + 1,
        })
        .eq("id", round_id);

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "no_count",
        bankerRerolls: r.banker_rerolls + 1,
      });
    }

    // ── POINT ──
    if (roll.result === "point") {
      await supabase
        .from("celo_rounds")
        .update({
          banker_roll: dice,
          banker_roll_name: roll.rollName,
          banker_roll_result: roll.result,
          banker_point: roll.point,
          status: "player_rolling",
        })
        .eq("id", round_id);

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "point",
        bankerPoint: roll.point,
        status: "player_rolling",
      });
    }

    // ── INSTANT WIN (banker) ──
    if (roll.result === "instant_win") {
      const totalPot = r.total_pot_cents;
      const platformFee = Math.floor((totalPot * feePct) / 100);
      const bankerWins = totalPot - platformFee;

      // Credit banker
      await walletLedgerEntry(
        rm.banker_id,
        "game_win",
        bankerWins,
        `celo_banker_win_${round_id}`
      );

      const newBankCents = rm.current_bank_cents + bankerWins;

      await Promise.all([
        // Complete round
        supabase.from("celo_rounds").update({
          banker_roll: dice,
          banker_roll_name: roll.rollName,
          banker_roll_result: roll.result,
          status: "completed",
          platform_fee_cents: platformFee,
          completed_at: now,
        }).eq("id", round_id),
        // Update room bank + celo flag
        supabase.from("celo_rooms").update({
          current_bank_cents: newBankCents,
          status: "active",
          last_activity: now,
          last_round_was_celo: roll.isCelo,
          banker_celo_at: roll.isCelo ? now : null,
        }).eq("id", room_id),
      ]);

      await settleOpenSideBets(supabase, round_id, room_id);

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "instant_win",
        isCelo: roll.isCelo,
        outcome: "banker_wins",
        bankerWinCents: bankerWins,
        platformFeeCents: platformFee,
        newBankCents,
        banker_can_lower_bank: roll.isCelo,
      });
    }

    // ── INSTANT LOSS (banker) ──
    if (roll.result === "instant_loss") {
      // Fetch all players in this round
      let playerQuery = supabase
        .from("celo_room_players")
        .select("user_id, bet_cents")
        .eq("room_id", room_id)
        .eq("role", "player")
        .gt("bet_cents", 0);

      if (r.bank_covered && r.covered_by) {
        playerQuery = playerQuery.eq("user_id", r.covered_by);
      }

      const { data: activePlayers } = await playerQuery;
      const players = (activePlayers ?? []) as { user_id: string; bet_cents: number }[];

      let totalBankDecrease = 0;
      const payouts: { user_id: string; payout: number; fee: number }[] = [];

      for (const player of players) {
        const gross = player.bet_cents * 2;
        const fee = Math.floor((gross * feePct) / 100);
        const payout = gross - fee;
        payouts.push({ user_id: player.user_id, payout, fee });
        totalBankDecrease += player.bet_cents;
      }

      // Credit all players
      await Promise.all(
        payouts.map(({ user_id, payout }) =>
          walletLedgerEntry(user_id, "game_win", payout, `celo_player_win_${round_id}_${user_id}`)
        )
      );

      const newBankCents = Math.max(0, rm.current_bank_cents - totalBankDecrease);

      // Find next banker (next player in seat order, wrapping)
      const { data: allPlayers } = await supabase
        .from("celo_room_players")
        .select("user_id, seat_number, role")
        .eq("room_id", room_id)
        .order("seat_number", { ascending: true });

      const sorted = (
        allPlayers as { user_id: string; seat_number: number; role: string }[]
      ).filter((p) => p.role !== "spectator");

      const currentBankerIdx = sorted.findIndex((p) => p.user_id === rm.banker_id);
      const nextBankerIdx = (currentBankerIdx + 1) % sorted.length;
      const nextBankerId = sorted[nextBankerIdx]?.user_id ?? rm.banker_id;

      await Promise.all([
        supabase.from("celo_rounds").update({
          banker_roll: dice,
          banker_roll_name: roll.rollName,
          banker_roll_result: roll.result,
          status: "completed",
          completed_at: now,
        }).eq("id", round_id),
        supabase.from("celo_rooms").update({
          current_bank_cents: newBankCents,
          banker_id: nextBankerId,
          status: "active",
          last_activity: now,
          last_round_was_celo: false,
          banker_celo_at: null,
        }).eq("id", room_id),
        // Rotate roles
        supabase.from("celo_room_players")
          .update({ role: "player" })
          .eq("room_id", room_id)
          .eq("user_id", rm.banker_id),
        supabase.from("celo_room_players")
          .update({ role: "banker" })
          .eq("room_id", room_id)
          .eq("user_id", nextBankerId),
      ]);

      await settleOpenSideBets(supabase, round_id, room_id);

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "instant_loss",
        outcome: "banker_loses_all_win",
        payouts,
        newBankCents,
        newBankerId: nextBankerId,
      });
    }
  }

  // ── PLAYER ROLL ────────────────────────────────────────────────────────────

  if (r.status === "player_rolling") {
    if (r.banker_point === null) {
      return NextResponse.json({ error: "No banker point set" }, { status: 400 });
    }

    // Determine whose turn it is
    const currentPlayer = await getNextPlayer(supabase, room_id, round_id, r.covered_by);
    if (!currentPlayer) {
      return NextResponse.json({ error: "No players remaining to roll" }, { status: 400 });
    }

    if (currentPlayer.user_id !== userId) {
      return NextResponse.json({ error: "Not your turn to roll" }, { status: 403 });
    }

    const playerBet = currentPlayer.bet_cents;
    const rerollCount = await getPlayerRerollCount(supabase, round_id, userId);
    const feePct = rm.platform_fee_pct;

    const dice = rollThreeDice();
    const roll = evaluateRoll(dice);

    await supabase.from("celo_audit_log").insert({
      room_id,
      round_id,
      user_id: userId,
      action: "player_rolled",
      details: {
        dice,
        roll_name: roll.rollName,
        result: roll.result,
        is_celo: roll.isCelo,
        banker_point: r.banker_point,
      },
    });

    // ── NO COUNT ──
    if (roll.result === "no_count") {
      await supabase.from("celo_player_rolls").insert({
        round_id,
        room_id,
        user_id: userId,
        roll_number: rerollCount + 1,
        dice,
        roll_name: roll.rollName,
        roll_result: roll.result,
        bet_cents: playerBet,
        outcome: "reroll",
        payout_cents: 0,
        reroll_count: rerollCount + 1,
      });

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "no_count",
        rerollCount: rerollCount + 1,
      });
    }

    // ── INSTANT WIN (player) ──
    if (roll.result === "instant_win") {
      const gross = playerBet * 2;
      const fee = Math.floor((gross * feePct) / 100);
      const payout = gross - fee;

      await walletLedgerEntry(
        userId,
        "game_win",
        payout,
        `celo_player_win_${round_id}_${userId}`
      );

      const playerCeloAt = roll.isCelo ? now : null;

      await supabase.from("celo_player_rolls").insert({
        round_id,
        room_id,
        user_id: userId,
        roll_number: rerollCount + 1,
        dice,
        roll_name: roll.rollName,
        roll_result: roll.result,
        bet_cents: playerBet,
        outcome: "win",
        payout_cents: payout,
        platform_fee_cents: fee,
        reroll_count: rerollCount,
        player_celo_at: playerCeloAt,
      });

      // Shrink bank
      await supabase
        .from("celo_rooms")
        .update({
          current_bank_cents: Math.max(0, rm.current_bank_cents - playerBet),
          last_activity: now,
        })
        .eq("id", room_id);

      // Check if round complete
      const allDone = await checkAndCompleteRound(supabase, room_id, round_id, r.covered_by);

      if (allDone) {
        await Promise.all([
          supabase.from("celo_rounds")
            .update({ status: "completed", completed_at: now })
            .eq("id", round_id),
          supabase.from("celo_rooms")
            .update({ status: "active" })
            .eq("id", room_id),
        ]);
        await settleOpenSideBets(supabase, round_id, room_id);
      }

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "instant_win",
        isCelo: roll.isCelo,
        outcome: "win",
        payoutCents: payout,
        feeCents: fee,
        roundComplete: allDone,
        // Offer banker switch only if player rolled C-Lo
        player_can_become_banker: roll.isCelo,
        player_must_have_cents: roll.isCelo ? rm.current_bank_cents : undefined,
      });
    }

    // ── INSTANT LOSS (player) ──
    if (roll.result === "instant_loss") {
      await supabase.from("celo_player_rolls").insert({
        round_id,
        room_id,
        user_id: userId,
        roll_number: rerollCount + 1,
        dice,
        roll_name: roll.rollName,
        roll_result: roll.result,
        bet_cents: playerBet,
        outcome: "loss",
        payout_cents: 0,
        reroll_count: rerollCount,
      });

      // Banker wins this bet
      const bankerNet = Math.floor((playerBet * (100 - feePct)) / 100);
      await walletLedgerEntry(
        rm.banker_id,
        "game_win",
        bankerNet,
        `celo_banker_win_player_loss_${round_id}_${userId}`
      );
      await supabase
        .from("celo_rooms")
        .update({
          current_bank_cents: rm.current_bank_cents + bankerNet,
          last_activity: now,
        })
        .eq("id", room_id);

      const allDone = await checkAndCompleteRound(supabase, room_id, round_id, r.covered_by);
      if (allDone) {
        await Promise.all([
          supabase.from("celo_rounds")
            .update({ status: "completed", completed_at: now })
            .eq("id", round_id),
          supabase.from("celo_rooms")
            .update({ status: "active" })
            .eq("id", room_id),
        ]);
        await settleOpenSideBets(supabase, round_id, room_id);
      }

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "instant_loss",
        outcome: "loss",
        roundComplete: allDone,
      });
    }

    // ── POINT (player) ──
    if (roll.result === "point" && roll.point !== undefined) {
      const comparison = comparePoints(r.banker_point, roll.point);
      const playerWins = comparison === "player_wins";

      let payoutCents = 0;
      let feeCents = 0;

      if (playerWins) {
        const gross = playerBet * 2;
        feeCents = Math.floor((gross * feePct) / 100);
        payoutCents = gross - feeCents;

        await walletLedgerEntry(
          userId,
          "game_win",
          payoutCents,
          `celo_player_win_${round_id}_${userId}`
        );
        await supabase
          .from("celo_rooms")
          .update({
            current_bank_cents: Math.max(0, rm.current_bank_cents - playerBet),
            last_activity: now,
          })
          .eq("id", room_id);
      } else {
        // Banker wins this individual bet
        const bankerNet = Math.floor((playerBet * (100 - feePct)) / 100);
        await walletLedgerEntry(
          rm.banker_id,
          "game_win",
          bankerNet,
          `celo_banker_win_point_${round_id}_${userId}`
        );
        await supabase
          .from("celo_rooms")
          .update({
            current_bank_cents: rm.current_bank_cents + bankerNet,
            last_activity: now,
          })
          .eq("id", room_id);
      }

      await supabase.from("celo_player_rolls").insert({
        round_id,
        room_id,
        user_id: userId,
        roll_number: rerollCount + 1,
        dice,
        roll_name: roll.rollName,
        roll_result: roll.result,
        point: roll.point,
        bet_cents: playerBet,
        outcome: playerWins ? "win" : "loss",
        payout_cents: payoutCents,
        platform_fee_cents: feeCents,
        reroll_count: rerollCount,
      });

      const allDone = await checkAndCompleteRound(supabase, room_id, round_id, r.covered_by);
      if (allDone) {
        await Promise.all([
          supabase.from("celo_rounds")
            .update({ status: "completed", completed_at: now })
            .eq("id", round_id),
          supabase.from("celo_rooms")
            .update({ status: "active" })
            .eq("id", room_id),
        ]);
        await settleOpenSideBets(supabase, round_id, room_id);
      }

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "point",
        playerPoint: roll.point,
        bankerPoint: r.banker_point,
        outcome: playerWins ? "win" : "loss",
        payoutCents,
        feeCents,
        roundComplete: allDone,
      });
    }
  }

  return NextResponse.json({ error: "Round is not in a rollable state" }, { status: 400 });
}
