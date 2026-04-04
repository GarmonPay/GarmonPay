import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import {
  rollThreeDice,
  evaluateRoll,
  comparePoints,
  isBankerShitRoll,
  isBankerDickRoll,
  calculatePayout,
} from "@/lib/celo-engine";
import { normalizeCeloRoomRow, mergeCeloRoomUpdate, type NormalizedCeloRoom } from "@/lib/celo-room-schema";

// ── HELPERS ────────────────────────────────────────────────────────────────────

type SupabaseClient = NonNullable<ReturnType<typeof createAdminClient>>;

type EligiblePlayer = { user_id: string; bet_cents: number; seat_number: number | null };

function roundTotalPotCents(roundRow: Record<string, unknown>): number {
  return Number(
    roundRow.prize_pool_sc ?? roundRow.total_pot_sc ?? roundRow.total_pot_cents ?? 0
  );
}

/** Players who roll vs the banker this round (seat order). */
async function getEligiblePlayers(
  supabase: SupabaseClient,
  roomId: string,
  coveredBy: string | null
): Promise<EligiblePlayer[]> {
  let q = supabase
    .from("celo_room_players")
    .select("user_id, bet_cents, seat_number")
    .eq("room_id", roomId)
    .eq("role", "player")
    .gt("bet_cents", 0)
    .order("seat_number", { ascending: true });

  if (coveredBy) {
    q = q.eq("user_id", coveredBy);
  }

  const { data: players } = await q;
  return (players ?? []) as EligiblePlayer[];
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

async function finalizePlayerRollingRound(
  supabase: SupabaseClient,
  roomId: string,
  roundId: string,
  now: string
) {
  await Promise.all([
    supabase
      .from("celo_rounds")
      .update({ status: "completed", completed_at: now })
      .eq("id", roundId),
    supabase
      .from("celo_rooms")
      .update({ status: "active", last_activity: now })
      .eq("id", roomId),
  ]);
  await settleOpenSideBets(supabase, roundId, roomId);
}

async function buildRoundSummary(supabase: SupabaseClient, roundId: string) {
  const { data: rolls } = await supabase
    .from("celo_player_rolls")
    .select("user_id, outcome, payout_sc, entry_sc")
    .eq("round_id", roundId)
    .in("outcome", ["win", "loss"])
    .order("created_at", { ascending: true });

  const list = (rolls ?? []) as {
    user_id: string;
    outcome: string;
    payout_sc: number;
    entry_sc: number;
  }[];

  let bankerNetCents = 0;
  const playerResults = list.map((row) => {
    if (row.outcome === "win") {
      bankerNetCents -= row.payout_sc;
      return {
        userId: row.user_id,
        outcome: "win" as const,
        amountCents: row.payout_sc,
        label: `Won $${(row.payout_sc / 100).toFixed(2)}`,
      };
    }
    bankerNetCents += row.entry_sc;
    return {
      userId: row.user_id,
      outcome: "loss" as const,
      amountCents: row.entry_sc,
      label: `Lost $${(row.entry_sc / 100).toFixed(2)}`,
    };
  });

  return {
    playerResults,
    bankerNetCents,
    bankerLabel:
      bankerNetCents >= 0
        ? `Banker up $${(bankerNetCents / 100).toFixed(2)} this round`
        : `Bank paid out $${(Math.abs(bankerNetCents) / 100).toFixed(2)} net`,
  };
}

/** After a resolving player roll, move to next seat or complete the round. */
async function advanceAfterResolvingPlayerRoll(
  supabase: SupabaseClient,
  roomId: string,
  roundId: string,
  rollerUserId: string,
  coveredBy: string | null,
  now: string
): Promise<{ roundComplete: boolean; summary?: Record<string, unknown> }> {
  const eligible = await getEligiblePlayers(supabase, roomId, coveredBy);
  const idx = eligible.findIndex((p) => p.user_id === rollerUserId);
  const next = idx >= 0 ? eligible[idx + 1] : null;

  if (!next) {
    await finalizePlayerRollingRound(supabase, roomId, roundId, now);
    const summary = await buildRoundSummary(supabase, roundId);
    return { roundComplete: true, summary: summary as unknown as Record<string, unknown> };
  }

  await supabase
    .from("celo_rounds")
    .update({ current_player_seat: next.seat_number ?? 1 })
    .eq("id", roundId);

  return { roundComplete: false };
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

  const parsed = body as { room_id?: string; round_id?: string };
  const { room_id } = parsed;
  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  let round_id: string;
  if (parsed.round_id) {
    round_id = parsed.round_id;
  } else {
    const { data: activeRound } = await supabase
      .from("celo_rounds")
      .select("id, status, banker_point, current_player_seat")
      .eq("room_id", room_id)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeRound?.id) {
      return NextResponse.json({ error: "No active round for this room" }, { status: 400 });
    }
    round_id = activeRound.id;
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
    bank_covered: boolean;
    covered_by: string | null;
    completed_at: string | null;
    current_player_seat: number | null;
  };

  if (r.completed_at || r.status === "completed") {
    return NextResponse.json({ error: "Round is already completed" }, { status: 400 });
  }

  // Fetch room (supports current_bank_sc / minimum_entry_sc or legacy *_cents columns)
  const { data: room } = await supabase.from("celo_rooms").select("*").eq("id", room_id).single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const rm = normalizeCeloRoomRow(room as Record<string, unknown>) as NormalizedCeloRoom & {
    banker_id: string;
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

    // First eligible seat when transitioning to player_rolling (must match game rules)
    let firstSeatForPoint: number | null = null;
    if (roll.result === "point") {
      const eligible = await getEligiblePlayers(supabase, room_id, r.covered_by);
      firstSeatForPoint = eligible[0]?.seat_number ?? 1;
    }

    let platformFeeForRound: number | undefined;
    if (roll.result === "instant_win") {
      const totalPot = roundTotalPotCents(round as Record<string, unknown>);
      platformFeeForRound = Math.floor((totalPot * feePct) / 100);
    }

    const completedAtInstant =
      roll.result === "instant_win" || roll.result === "instant_loss" ? now : null;

    const statusAfterRoll =
      roll.result === "point"
        ? "player_rolling"
        : roll.result === "no_count"
          ? "banker_rolling"
          : "completed";

    const bankerPointValue =
      roll.result === "point" && roll.point !== undefined ? roll.point : null;

    // Persist dice + outcome immediately so Supabase realtime notifies all clients before payouts
    const roundUpdate: Record<string, unknown> = {
      banker_dice: dice,
      banker_dice_name: roll.rollName,
      banker_dice_result: roll.result,
      banker_point: bankerPointValue,
      status: statusAfterRoll,
      current_player_seat: roll.result === "point" ? firstSeatForPoint : null,
      completed_at: completedAtInstant,
    };

    if (roll.result === "no_count") {
      roundUpdate.banker_rerolls = r.banker_rerolls + 1;
    }
    if (roll.result === "instant_win" && platformFeeForRound !== undefined) {
      roundUpdate.platform_fee_sc = platformFeeForRound;
    }

    const { error: bankerRoundUpErr } = await supabase
      .from("celo_rounds")
      .update(roundUpdate)
      .eq("id", round_id);

    if (bankerRoundUpErr) {
      console.error("celo_rounds banker roll update:", bankerRoundUpErr);
      return NextResponse.json({ error: "Failed to save banker roll" }, { status: 500 });
    }

    await supabase.from("celo_audit_log").insert({
      room_id,
      round_id,
      user_id: userId,
      action: "banker_rolled",
      details: { dice, roll_name: roll.rollName, result: roll.result, is_celo: roll.isCelo },
    });

    if (roll.result === "no_count") {
      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "no_count",
        bankerRerolls: r.banker_rerolls + 1,
      });
    }

    if (roll.result === "point") {
      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "point",
        bankerPoint: roll.point,
        status: "player_rolling",
        currentPlayerSeat: firstSeatForPoint,
      });
    }

    // ── INSTANT WIN (banker) — round row already completed above ──
    if (roll.result === "instant_win") {
      const totalPot = roundTotalPotCents(round as Record<string, unknown>);
      const platformFee = platformFeeForRound ?? Math.floor((totalPot * feePct) / 100);
      const bankerWins = totalPot - platformFee;

      await walletLedgerEntry(
        rm.banker_id,
        "game_win",
        bankerWins,
        `celo_banker_win_${round_id}`
      );

      const newBankCents = rm.current_bank_cents + bankerWins;

      await supabase
        .from("celo_rooms")
        .update(
          mergeCeloRoomUpdate(newBankCents, {
            status: "active",
            last_activity: now,
            last_round_was_celo: roll.isCelo,
            banker_celo_at: roll.isCelo ? now : null,
          })
        )
        .eq("id", room_id);

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

    // ── INSTANT LOSS (banker) — round row already completed above ──
    if (roll.result === "instant_loss") {
      // Dick (pair + 1): small bank hit only — no table payout, no banker change
      if (isBankerDickRoll(dice)) {
        const lossAmount = Math.min(rm.current_bank_cents, rm.min_bet_cents);
        const newBankCents = Math.max(0, rm.current_bank_cents - lossAmount);

        await supabase
          .from("celo_rooms")
          .update(
            mergeCeloRoomUpdate(newBankCents, {
              status: "active",
              last_activity: now,
              last_round_was_celo: false,
              banker_celo_at: null,
            })
          )
          .eq("id", room_id);

        await settleOpenSideBets(supabase, round_id, room_id);

        return NextResponse.json({
          dice,
          rollName: roll.rollName,
          result: "instant_loss",
          outcome: "dick",
          bankLossCents: lossAmount,
          newBankCents,
        });
      }

      // Shit (1-2-3): full table win; bank drops by total loss; banker only rotates
      // when someone covered the bank — then the covering player becomes banker.
      if (!isBankerShitRoll(dice)) {
        return NextResponse.json({ error: "Unexpected instant_loss roll" }, { status: 500 });
      }

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

      const payouts: { user_id: string; payout: number; fee: number }[] = [];
      let totalBankDecrease = 0;

      for (const player of players) {
        const { netPayoutCents, platformFeeCents } = calculatePayout(player.bet_cents, feePct);
        payouts.push({
          user_id: player.user_id,
          payout: netPayoutCents,
          fee: platformFeeCents,
        });
        totalBankDecrease += player.bet_cents;
      }

      await Promise.all(
        payouts.map(({ user_id, payout }) =>
          walletLedgerEntry(user_id, "game_win", payout, `celo_player_win_${round_id}_${user_id}`)
        )
      );

      const newBankCents = Math.max(0, rm.current_bank_cents - totalBankDecrease);

      const coverTakeover = Boolean(r.bank_covered && r.covered_by);
      const nextBankerId = coverTakeover ? r.covered_by! : rm.banker_id;

      const roomUpdate = mergeCeloRoomUpdate(newBankCents, {
        banker_id: nextBankerId,
        status: "active",
        last_activity: now,
        last_round_was_celo: false,
        banker_celo_at: null,
      });

      if (coverTakeover && nextBankerId !== rm.banker_id) {
        await Promise.all([
          supabase.from("celo_rooms").update(roomUpdate).eq("id", room_id),
          supabase
            .from("celo_room_players")
            .update({ role: "player" })
            .eq("room_id", room_id)
            .eq("user_id", rm.banker_id),
          supabase
            .from("celo_room_players")
            .update({ role: "banker" })
            .eq("room_id", room_id)
            .eq("user_id", nextBankerId),
        ]);
      } else {
        await supabase.from("celo_rooms").update(roomUpdate).eq("id", room_id);
      }

      await settleOpenSideBets(supabase, round_id, room_id);

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "instant_loss",
        outcome: "banker_loses_all_win",
        payouts,
        newBankCents,
        newBankerId: nextBankerId,
        bankerChanged: coverTakeover && nextBankerId !== rm.banker_id,
      });
    }
  }

  // ── PLAYER ROLL ────────────────────────────────────────────────────────────

  if (r.status === "player_rolling") {
    if (r.banker_point === null) {
      return NextResponse.json({ error: "No banker point set" }, { status: 400 });
    }

    const eligible = await getEligiblePlayers(supabase, room_id, r.covered_by);
    if (eligible.length === 0) {
      return NextResponse.json({ error: "No players remaining to roll" }, { status: 400 });
    }

    let currentSeat = r.current_player_seat;
    if (currentSeat == null) {
      const firstSeat = eligible[0]?.seat_number ?? 1;
      await supabase
        .from("celo_rounds")
        .update({ current_player_seat: firstSeat })
        .eq("id", round_id);
      currentSeat = firstSeat;
    }

    const currentPlayer =
      eligible.find((p) => p.seat_number === currentSeat) ?? eligible[0];

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
        entry_sc: playerBet,
        outcome: "reroll",
        payout_sc: 0,
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
        entry_sc: playerBet,
        outcome: "win",
        payout_sc: payout,
        platform_fee_sc: fee,
        reroll_count: rerollCount,
        player_celo_at: playerCeloAt,
      });

      // Player wins are paid from the round pot / ledger — do not shrink the room bank
      // (bank only moves on banker wins/losses on the bank itself).
      await supabase.from("celo_rooms").update({ last_activity: now }).eq("id", room_id);

      const adv = await advanceAfterResolvingPlayerRoll(
        supabase,
        room_id,
        round_id,
        userId,
        r.covered_by,
        now
      );

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "instant_win",
        isCelo: roll.isCelo,
        outcome: "win",
        payoutCents: payout,
        feeCents: fee,
        roundComplete: adv.roundComplete,
        summary: adv.summary,
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
        entry_sc: playerBet,
        outcome: "loss",
        payout_sc: 0,
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
        .update(
          mergeCeloRoomUpdate(rm.current_bank_cents + bankerNet, {
            last_activity: now,
          })
        )
        .eq("id", room_id);

      const adv = await advanceAfterResolvingPlayerRoll(
        supabase,
        room_id,
        round_id,
        userId,
        r.covered_by,
        now
      );

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "instant_loss",
        outcome: "loss",
        roundComplete: adv.roundComplete,
        summary: adv.summary,
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
        await supabase.from("celo_rooms").update({ last_activity: now }).eq("id", room_id);
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
          .update(
            mergeCeloRoomUpdate(rm.current_bank_cents + bankerNet, {
              last_activity: now,
            })
          )
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
        entry_sc: playerBet,
        outcome: playerWins ? "win" : "loss",
        payout_sc: payoutCents,
        platform_fee_sc: feeCents,
        reroll_count: rerollCount,
      });

      const adv = await advanceAfterResolvingPlayerRoll(
        supabase,
        room_id,
        round_id,
        userId,
        r.covered_by,
        now
      );

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "point",
        playerPoint: roll.point,
        bankerPoint: r.banker_point,
        outcome: playerWins ? "win" : "loss",
        payoutCents,
        feeCents,
        roundComplete: adv.roundComplete,
        summary: adv.summary,
      });
    }
  }

  return NextResponse.json({ error: "Round is not in a rollable state" }, { status: 400 });
}
