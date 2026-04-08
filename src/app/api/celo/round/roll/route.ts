import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { celoPayoutTestCredit, celoWalletCredit, insertCeloPlatformFee } from "@/lib/celo-payout-ledger";
import { rollThreeDice, evaluateRoll, comparePoints } from "@/lib/celo-engine";
import { normalizeCeloRoomRow, mergeCeloRoomUpdate, type NormalizedCeloRoom } from "@/lib/celo-room-schema";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import { broadcastCeloRoomEvent, buildCeloRollStartedPayload } from "@/lib/celo-roll-broadcast";
import { CELO_ROLL_ANIMATION_DURATION_MS } from "@/lib/celo-roll-sync-constants";

// ── HELPERS ────────────────────────────────────────────────────────────────────

type SupabaseClient = NonNullable<ReturnType<typeof createAdminClient>>;

type EligiblePlayer = { user_id: string; bet_cents: number; seat_number: number | null };

function playerBetCents(row: { bet_cents?: number; entry_sc?: number }): number {
  return celoPlayerStakeCents(row);
}

function roundTotalPotCents(roundRow: Record<string, unknown>): number {
  return Number(
    roundRow.prize_pool_sc ?? roundRow.total_pot_sc ?? roundRow.total_pot_cents ?? 0
  );
}

/** Platform fee on 2× gross payouts (10%). */
function platformFeeFromGrossTenPct(grossCents: number): number {
  return Math.floor(grossCents * 0.1);
}

/** Players who roll vs the banker this round (seat order). */
async function getEligiblePlayers(
  supabase: SupabaseClient,
  roomId: string,
  coveredBy: string | null
): Promise<EligiblePlayer[]> {
  let q = supabase
    .from("celo_room_players")
    .select("user_id, bet_cents, entry_sc, seat_number")
    .eq("room_id", roomId)
    .eq("role", "player")
    .order("seat_number", { ascending: true });

  if (coveredBy) {
    q = q.eq("user_id", coveredBy);
  }

  const { data: players } = await q;
  const rows = (players ?? []) as {
    user_id: string;
    bet_cents?: number;
    entry_sc?: number;
    seat_number: number | null;
  }[];
  return rows
    .filter((p) => playerBetCents(p) > 0)
    .map((p) => ({
      user_id: p.user_id,
      bet_cents: playerBetCents(p),
      seat_number: p.seat_number,
    }));
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

async function emitCeloRollStarted(
  supabase: SupabaseClient,
  roomId: string,
  payload: ReturnType<typeof buildCeloRollStartedPayload>
) {
  console.log("[celo/roll] roll_started broadcast", {
    roomId: payload.roomId,
    roundId: payload.roundId,
    kind: payload.kind,
    serverStartTime: payload.serverStartTime,
    animationDurationMs: payload.animationDurationMs,
    syncKey: payload.syncKey,
  });
  try {
    await broadcastCeloRoomEvent(supabase, roomId, "roll_started", payload);
    console.log("[celo/roll] roll_started broadcast ok", payload.syncKey);
  } catch (e) {
    console.error("[celo/roll] roll_started broadcast failed", e);
  }
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
      await celoWalletCredit(
        supabase,
        bet.creator_id,
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
        celoWalletCredit(
          supabase,
          bet.creator_id,
          bet.amount_cents,
          `celo_sidebet_refund_${bet.id}_creator`
        ),
        celoWalletCredit(
          supabase,
          bet.acceptor_id,
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
    banker_dice?: number[] | null;
    banker_dice_result?: string | null;
  };

  if (r.completed_at || r.status === "completed") {
    return NextResponse.json({ error: "Round is already completed" }, { status: 400 });
  }

  console.log("[celo/roll] request", { userId, room_id, round_id });

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

    const serverStartTime = new Date().toISOString();

    // Persist dice + outcome immediately so Supabase realtime notifies all clients before payouts
    const roundUpdate: Record<string, unknown> = {
      banker_dice: dice,
      banker_dice_name: roll.rollName,
      banker_dice_result: roll.result,
      banker_point: bankerPointValue,
      status: statusAfterRoll,
      current_player_seat: roll.result === "point" ? firstSeatForPoint : null,
      completed_at: completedAtInstant,
      roll_animation_start_at: serverStartTime,
      roll_animation_duration_ms: CELO_ROLL_ANIMATION_DURATION_MS,
    };

    if (roll.result === "no_count") {
      roundUpdate.banker_rerolls = r.banker_rerolls + 1;
    }
    if (roll.result === "instant_win" && platformFeeForRound !== undefined) {
      roundUpdate.platform_fee_sc = platformFeeForRound;
    }

    let bankerUpdate = supabase
      .from("celo_rounds")
      .update(roundUpdate)
      .eq("id", round_id)
      .eq("status", "banker_rolling");

    const hasNoBankerDice =
      r.banker_dice == null || !Array.isArray(r.banker_dice) || r.banker_dice.length !== 3;

    if (hasNoBankerDice) {
      bankerUpdate = bankerUpdate.is("banker_dice", null);
    } else {
      bankerUpdate = bankerUpdate
        .eq("banker_dice_result", "no_count")
        .eq("banker_rerolls", r.banker_rerolls);
    }

    const { data: bankerUpRows, error: bankerRoundUpErr } = await bankerUpdate.select("id");

    if (bankerRoundUpErr) {
      console.error("celo_rounds banker roll update:", bankerRoundUpErr);
      return NextResponse.json({ error: "Failed to save banker roll" }, { status: 500 });
    }

    if (!bankerUpRows || bankerUpRows.length === 0) {
      console.warn("[celo/roll] banker conditional update matched 0 rows — duplicate or stale roll");
      return NextResponse.json(
        { error: "Roll already recorded or round state changed — try again" },
        { status: 409 }
      );
    }

    await supabase.from("celo_audit_log").insert({
      room_id,
      round_id,
      user_id: userId,
      action: "banker_rolled",
      details: { dice, roll_name: roll.rollName, result: roll.result, is_celo: roll.isCelo },
    });

    const bankerSync = buildCeloRollStartedPayload({
      roomId: room_id,
      roundId: round_id,
      dice: dice as [number, number, number],
      kind: "banker",
      rollerUserId: rm.banker_id,
      serverStartTime,
    });
    await emitCeloRollStarted(supabase, room_id, bankerSync);

    if (roll.result === "no_count") {
      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "no_count",
        bankerRerolls: r.banker_rerolls + 1,
        animationPayload: bankerSync,
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
        animationPayload: bankerSync,
      });
    }

    // ── INSTANT WIN (banker) — round row already completed above ──
    if (roll.result === "instant_win") {
      const totalPot = roundTotalPotCents(round as Record<string, unknown>);
      const platformFee = platformFeeForRound ?? Math.floor((totalPot * feePct) / 100);
      const bankerWins = totalPot - platformFee;

      await celoPayoutTestCredit(supabase, rm.banker_id);

      const winRef = `celo_banker_win_${round_id}_${Date.now()}`;
      await celoWalletCredit(supabase, rm.banker_id, bankerWins, winRef);
      await insertCeloPlatformFee(supabase, round_id, platformFee, roll.rollName);

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

      const instantWinPayload: Record<string, unknown> = {
        dice,
        rollName: roll.rollName,
        result: "instant_win",
        isCelo: roll.isCelo,
        bankerWinSC: bankerWins,
        bankerWinCents: bankerWins,
        platformFeeCents: platformFee,
        newBankSC: newBankCents,
        newBankCents,
      };

      if (roll.isCelo) {
        instantWinPayload.outcome = "celo_banker_wins";
        instantWinPayload.banker_can_adjust_bank = true;
      } else {
        instantWinPayload.outcome = "banker_wins";
        instantWinPayload.banker_can_adjust_bank = false;
      }

      return NextResponse.json({ ...instantWinPayload, animationPayload: bankerSync });
    }

    // ── INSTANT LOSS (banker) — Shit / Dick: pay table, bank drops by total payouts; banker stays unless broke ──
    if (roll.result === "instant_loss") {
      const { data: activePlayers } = await supabase
        .from("celo_room_players")
        .select("user_id, bet_cents, entry_sc")
        .eq("room_id", room_id)
        .eq("role", "player");

      const players = ((activePlayers ?? []) as { user_id: string; bet_cents?: number; entry_sc?: number }[])
        .map((row) => ({ user_id: row.user_id, bet: playerBetCents(row) }))
        .filter((p) => p.bet > 0);

      const payouts: { user_id: string; payout: number; fee: number }[] = [];
      let totalPaidOut = 0;
      let totalPlatformFeeCents = 0;

      for (const player of players) {
        const gross = player.bet * 2;
        const fee = platformFeeFromGrossTenPct(gross);
        const payout = gross - fee;
        payouts.push({ user_id: player.user_id, payout, fee });
        totalPaidOut += payout;
        totalPlatformFeeCents += fee;
      }

      for (const { user_id, payout } of payouts) {
        await celoWalletCredit(
          supabase,
          user_id,
          payout,
          `celo_player_win_${round_id}_${user_id}_${Date.now()}`
        );
      }
      await insertCeloPlatformFee(supabase, round_id, totalPlatformFeeCents, roll.rollName);

      let newBankCents = Math.max(0, rm.current_bank_cents - totalPaidOut);

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

      let bankerChanged = false;
      let newBankerId: string | null = null;

      const minimumEntry = rm.min_bet_cents;

      if (newBankCents < minimumEntry) {
        const { data: allPlayers } = await supabase
          .from("celo_room_players")
          .select("user_id, seat_number, role")
          .eq("room_id", room_id)
          .neq("role", "spectator")
          .order("seat_number", { ascending: true });

        for (const row of allPlayers ?? []) {
          const player = row as { user_id: string; seat_number: number | null; role: string };
          if (player.user_id === rm.banker_id) continue;

          const { data: wb } = await supabase
            .from("wallet_balances")
            .select("balance")
            .eq("user_id", player.user_id)
            .maybeSingle();

          const balance = Number((wb as { balance?: number } | null)?.balance ?? 0);
          if (balance >= newBankCents) {
            await supabase
              .from("celo_room_players")
              .update({ role: "player" })
              .eq("room_id", room_id)
              .eq("user_id", rm.banker_id);

            await supabase
              .from("celo_room_players")
              .update({ role: "banker" })
              .eq("room_id", room_id)
              .eq("user_id", player.user_id);

            await supabase.from("celo_rooms").update({ banker_id: player.user_id }).eq("id", room_id);

            bankerChanged = true;
            newBankerId = player.user_id;
            break;
          }
        }

        if (!bankerChanged) {
          await supabase.from("celo_rooms").update({ status: "cancelled" }).eq("id", room_id);
        }
      }

      await settleOpenSideBets(supabase, round_id, room_id);

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "instant_loss",
        outcome: "banker_loses_players_win",
        payouts,
        newBankSC: newBankCents,
        newBankCents,
        bankerChanged,
        newBankerId: newBankerId ?? undefined,
        bankerBroke: newBankCents < minimumEntry,
        animationPayload: bankerSync,
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
      const serverStartTime = new Date().toISOString();
      const { data: prRow, error: prInsErr } = await supabase
        .from("celo_player_rolls")
        .insert({
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
          roll_animation_start_at: serverStartTime,
          roll_animation_duration_ms: CELO_ROLL_ANIMATION_DURATION_MS,
        })
        .select("id")
        .single();

      if (prInsErr || !prRow) {
        console.error("[celo/roll] player no_count insert:", prInsErr);
        return NextResponse.json({ error: "Failed to save roll" }, { status: 500 });
      }

      const plSync = buildCeloRollStartedPayload({
        roomId: room_id,
        roundId: round_id,
        dice: dice as [number, number, number],
        kind: "player",
        playerRollId: prRow.id,
        rollerUserId: userId,
        serverStartTime,
      });
      await emitCeloRollStarted(supabase, room_id, plSync);

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "no_count",
        rerollCount: rerollCount + 1,
        animationPayload: plSync,
      });
    }

    // ── INSTANT WIN (player) ──
    if (roll.result === "instant_win") {
      const gross = playerBet * 2;
      const fee = platformFeeFromGrossTenPct(gross);
      const payout = gross - fee;

      await celoWalletCredit(
        supabase,
        userId,
        payout,
        `celo_player_win_${round_id}_${userId}_${Date.now()}`
      );
      await insertCeloPlatformFee(supabase, round_id, fee, roll.rollName);

      const playerCeloAt = roll.isCelo ? now : null;

      const serverStartTime = new Date().toISOString();
      const { data: prWin, error: prWinErr } = await supabase
        .from("celo_player_rolls")
        .insert({
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
          roll_animation_start_at: serverStartTime,
          roll_animation_duration_ms: CELO_ROLL_ANIMATION_DURATION_MS,
        })
        .select("id")
        .single();

      if (prWinErr || !prWin) {
        console.error("[celo/roll] player instant_win insert:", prWinErr);
        return NextResponse.json({ error: "Failed to save roll" }, { status: 500 });
      }

      const plSync = buildCeloRollStartedPayload({
        roomId: room_id,
        roundId: round_id,
        dice: dice as [number, number, number],
        kind: "player",
        playerRollId: prWin.id,
        rollerUserId: userId,
        serverStartTime,
      });
      await emitCeloRollStarted(supabase, room_id, plSync);

      await supabase.from("celo_rooms").update({ last_activity: now }).eq("id", room_id);

      const adv = await advanceAfterResolvingPlayerRoll(
        supabase,
        room_id,
        round_id,
        userId,
        r.covered_by,
        now
      );

      const coverOffer = Boolean(r.bank_covered && r.covered_by && userId === r.covered_by);

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
        player_can_become_banker: coverOffer,
        banker_cost_sc: coverOffer ? rm.current_bank_cents : undefined,
        animationPayload: plSync,
      });
    }

    // ── INSTANT LOSS (player) ──
    if (roll.result === "instant_loss") {
      const serverStartTime = new Date().toISOString();
      const { data: prLoss, error: prLossErr } = await supabase
        .from("celo_player_rolls")
        .insert({
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
          roll_animation_start_at: serverStartTime,
          roll_animation_duration_ms: CELO_ROLL_ANIMATION_DURATION_MS,
        })
        .select("id")
        .single();

      if (prLossErr || !prLoss) {
        console.error("[celo/roll] player instant_loss insert:", prLossErr);
        return NextResponse.json({ error: "Failed to save roll" }, { status: 500 });
      }

      const plSync = buildCeloRollStartedPayload({
        roomId: room_id,
        roundId: round_id,
        dice: dice as [number, number, number],
        kind: "player",
        playerRollId: prLoss.id,
        rollerUserId: userId,
        serverStartTime,
      });
      await emitCeloRollStarted(supabase, room_id, plSync);

      const bankerFee = Math.floor((playerBet * feePct) / 100);
      const bankerNet = playerBet - bankerFee;
      await celoWalletCredit(
        supabase,
        rm.banker_id,
        bankerNet,
        `celo_banker_win_player_loss_${round_id}_${userId}_${Date.now()}`
      );
      await insertCeloPlatformFee(supabase, round_id, bankerFee, roll.rollName);
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
        animationPayload: plSync,
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
        feeCents = platformFeeFromGrossTenPct(gross);
        payoutCents = gross - feeCents;

        await celoWalletCredit(
          supabase,
          userId,
          payoutCents,
          `celo_player_point_win_${round_id}_${userId}_${Date.now()}`
        );
        await insertCeloPlatformFee(supabase, round_id, feeCents, roll.rollName);
        const bankAfterPlayerWin = Math.max(0, rm.current_bank_cents - playerBet);
        await supabase
          .from("celo_rooms")
          .update(
            mergeCeloRoomUpdate(bankAfterPlayerWin, {
              last_activity: now,
            })
          )
          .eq("id", room_id);
      } else {
        const bankerFee = Math.floor((playerBet * feePct) / 100);
        const bankerNet = playerBet - bankerFee;
        await celoWalletCredit(
          supabase,
          rm.banker_id,
          bankerNet,
          `celo_banker_point_win_${round_id}_${userId}_${Date.now()}`
        );
        await insertCeloPlatformFee(supabase, round_id, bankerFee, roll.rollName);
        await supabase
          .from("celo_rooms")
          .update(
            mergeCeloRoomUpdate(rm.current_bank_cents + bankerNet, {
              last_activity: now,
            })
          )
          .eq("id", room_id);
      }

      const serverStartTime = new Date().toISOString();
      const { data: prPoint, error: prPointErr } = await supabase
        .from("celo_player_rolls")
        .insert({
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
          roll_animation_start_at: serverStartTime,
          roll_animation_duration_ms: CELO_ROLL_ANIMATION_DURATION_MS,
        })
        .select("id")
        .single();

      if (prPointErr || !prPoint) {
        console.error("[celo/roll] player point insert:", prPointErr);
        return NextResponse.json({ error: "Failed to save roll" }, { status: 500 });
      }

      const plSync = buildCeloRollStartedPayload({
        roomId: room_id,
        roundId: round_id,
        dice: dice as [number, number, number],
        kind: "player",
        playerRollId: prPoint.id,
        rollerUserId: userId,
        serverStartTime,
      });
      await emitCeloRollStarted(supabase, room_id, plSync);

      const adv = await advanceAfterResolvingPlayerRoll(
        supabase,
        room_id,
        round_id,
        userId,
        r.covered_by,
        now
      );

      const coverOffer = Boolean(
        playerWins && r.bank_covered && r.covered_by && userId === r.covered_by
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
        player_can_become_banker: coverOffer,
        banker_cost_sc: coverOffer ? rm.current_bank_cents : undefined,
        animationPayload: plSync,
      });
    }
  }

  return NextResponse.json({ error: "Round is not in a rollable state" }, { status: 400 });
}
