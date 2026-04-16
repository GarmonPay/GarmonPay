import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { celoWalletCredit, insertCeloPlatformFee } from "@/lib/celo-payout-ledger";
import { rollThreeDice, evaluateRoll, calculatePayout, resolvePlayerVsBankerPoint } from "@/lib/celo-engine";
import { normalizeCeloRoomRow, mergeCeloRoomUpdate } from "@/lib/celo-room-schema";
import { CELO_ROLL_ANIMATION_DURATION_MS } from "@/lib/celo-roll-sync-constants";
import { buildCeloRollStartedPayload, broadcastCeloRoomEvent } from "@/lib/celo-roll-broadcast";
import { celoAcquireRoundRollLock, celoReleaseRoundRollLock } from "@/lib/celo-round-roll-lock";

export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: { room_id?: string };
  try {
    body = (await req.json()) as { room_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { room_id } = body;
  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  const { data: activeRoundRows, error: roundListErr } = await supabase
    .from("celo_rounds")
    .select("*")
    .eq("room_id", room_id)
    .neq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);

  if (roundListErr) {
    return NextResponse.json({ error: roundListErr.message }, { status: 500 });
  }

  const activeRound = celoFirstRow(activeRoundRows);
  if (!activeRound) {
    return NextResponse.json({ error: "No active round" }, { status: 400 });
  }

  const round_id = activeRound.id as string;
  const r = activeRound as Record<string, unknown>;

  const { data: roomRows, error: roomErr } = await supabase
    .from("celo_rooms")
    .select("*")
    .eq("id", room_id)
    .limit(1);

  const roomRow = celoFirstRow(roomRows);
  if (roomErr || !roomRow) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const rm = normalizeCeloRoomRow(roomRow as Record<string, unknown>);
  if (!rm) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const bankerId = String(rm.banker_id ?? "");
  if (!bankerId) {
    return NextResponse.json({ error: "Room has no banker" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const feePct = rm.platform_fee_pct || 10;

  const { data: membershipRow } = await supabase
    .from("celo_room_players")
    .select("role")
    .eq("room_id", room_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membershipRow) {
    console.warn("[celo/roll] forbidden — not in room", { room_id, userId });
    return NextResponse.json({ error: "You are not seated in this room" }, { status: 403 });
  }
  const memberRole = String((membershipRow as { role?: string }).role ?? "");
  if (memberRole === "spectator") {
    return NextResponse.json({ error: "Spectators cannot roll" }, { status: 403 });
  }

  console.info("[celo/roll] request", { room_id, round_id, userId, status: r.status });

  // ── BANKER ROLL ──────────────────────────────────────────────

  if (r.status === "banker_rolling") {
    if (userId !== bankerId) {
      return NextResponse.json({ error: "Not your turn" }, { status: 403 });
    }

    const { data: playersData } = await supabase
      .from("celo_room_players")
      .select("user_id, entry_sc, bet_cents, seat_number")
      .eq("room_id", room_id)
      .eq("role", "player")
      .gt("entry_sc", 0)
      .order("seat_number", { ascending: true });

    const players = (playersData ?? []) as Array<{
      user_id: string;
      entry_sc?: number;
      bet_cents?: number;
      seat_number: number | null;
    }>;

    if (players.length < 1) {
      return NextResponse.json(
        { error: "At least one player with an entry is required before the banker can roll" },
        { status: 400 }
      );
    }

    const lock = await celoAcquireRoundRollLock(supabase, round_id, userId, { bankerSharedSpin: true });
    if (!lock.ok) {
      console.warn("[celo/roll] duplicate roll blocked (banker)", { round_id, userId });
      return NextResponse.json({ error: "Roll already in progress" }, { status: 409 });
    }
    const spinStart = lock.spinStartedAt;

    try {
    const dice = rollThreeDice();
    const roll = evaluateRoll(dice);
    console.info("[celo/roll] banker dice", { round_id, userId, dice, result: roll.result });

    let firstSeat = 1;
    if (roll.result === "point" && players.length > 0) {
      firstSeat = players[0]?.seat_number || 1;
    }

    const nowIso = new Date().toISOString();
    const { error: bankerRoundErr } = await supabase
      .from("celo_rounds")
      .update({
        banker_dice: dice,
        banker_dice_name: roll.rollName,
        banker_dice_result: roll.result,
        banker_point: roll.result === "point" ? roll.point : null,
        status:
          roll.result === "point"
            ? "player_rolling"
            : roll.result === "no_count"
              ? "banker_rolling"
              : "completed",
        current_player_seat: roll.result === "point" ? firstSeat : null,
        completed_at:
          roll.result === "instant_win" || roll.result === "instant_loss" ? nowIso : null,
        roll_animation_start_at: spinStart,
        roll_animation_duration_ms: CELO_ROLL_ANIMATION_DURATION_MS,
        roll_processing: false,
        roller_user_id: null,
        updated_at: nowIso,
      })
      .eq("id", round_id);

    if (bankerRoundErr) {
      console.error("[celo/roll] banker persist failed", bankerRoundErr);
      await celoReleaseRoundRollLock(supabase, round_id);
      return NextResponse.json({ error: bankerRoundErr.message }, { status: 500 });
    }

    console.info("[celo/roll] banker saved", { round_id, dice });

    const bankerRollPayload = buildCeloRollStartedPayload({
      roomId: room_id,
      roundId: round_id,
      dice: dice as [number, number, number],
      kind: "banker",
      rollerUserId: bankerId,
      serverStartTime: spinStart,
      rollName: roll.rollName,
      outcome: roll.result,
    });
    const b1 = await broadcastCeloRoomEvent(supabase, room_id, "roll_started", bankerRollPayload);
    if (!b1) console.warn("[celo/roll] roll_started broadcast failed (banker); clients rely on postgres_changes)");

    if (roll.result === "no_count") {
      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "no_count",
        animation: bankerRollPayload,
      });
    }

    if (roll.result === "point") {
      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "point",
        bankerPoint: roll.point,
        status: "player_rolling",
        currentPlayerSeat: firstSeat,
        animation: bankerRollPayload,
      });
    }

    if (roll.result === "instant_win") {
      const totalPot = players.reduce(
        (sum, p) => sum + (p.entry_sc ?? p.bet_cents ?? 0),
        0
      );
      const feeSC = Math.floor((totalPot * feePct) / 100);
      const bankerWins = totalPot - feeSC;

      if (bankerWins > 0) {
        const led = await celoWalletCredit(supabase, bankerId, bankerWins, `celo_banker_win_${round_id}`);
        if (!led.success) {
          return NextResponse.json(
            { error: "payout", message: led.message ?? "Payout failed" },
            { status: 500 }
          );
        }
      }

      if (feeSC > 0) {
        await insertCeloPlatformFee(supabase, round_id, feeSC, roll.rollName, {
          description: `C-Lo platform fee (banker instant win) - ${roll.rollName}`,
        });
      }

      const newBank = rm.current_bank_cents + bankerWins;
      await supabase
        .from("celo_rooms")
        .update(
          mergeCeloRoomUpdate(newBank, {
            status: "active",
            last_activity: now,
            last_round_was_celo: roll.isCelo,
            banker_celo_at: roll.isCelo ? now : null,
          })
        )
        .eq("id", room_id);

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "instant_win",
        isCelo: roll.isCelo,
        outcome: "banker_wins",
        bankerWinSC: bankerWins,
        newBankSC: newBank,
        banker_can_adjust_bank: roll.isCelo,
        animation: bankerRollPayload,
      });
    }

    if (roll.result === "instant_loss") {
      let totalPaidOut = 0;

      for (const player of players) {
        const entry = player.entry_sc ?? player.bet_cents ?? 0;
        if (entry <= 0) continue;

        const { payoutSC, feeSC: playerFeeSC } = calculatePayout(entry, "win", feePct);

        const led = await celoWalletCredit(
          supabase,
          player.user_id,
          payoutSC,
          `celo_player_win_${round_id}_${player.user_id}`
        );
        if (!led.success) {
          return NextResponse.json(
            { error: "payout", message: led.message ?? "Payout failed" },
            { status: 500 }
          );
        }
        if (playerFeeSC > 0) {
          await insertCeloPlatformFee(supabase, round_id, playerFeeSC, roll.rollName, {
            userId: player.user_id,
            description: `C-Lo platform fee (banker instant loss / player win) - ${roll.rollName}`,
          });
        }
        totalPaidOut += payoutSC;
      }

      /* Bank display amount does not shrink on player wins — only grows on banker wins or voluntary lower after C-Lo. */
      await supabase
        .from("celo_rooms")
        .update(
          mergeCeloRoomUpdate(rm.current_bank_cents, {
            status: "active",
            last_activity: now,
            last_round_was_celo: false,
          })
        )
        .eq("id", room_id);

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "instant_loss",
        outcome: "players_win",
        totalPaidOut,
        newBankSC: rm.current_bank_cents,
        bankerStays: true,
        animation: bankerRollPayload,
      });
    }
    } finally {
      await celoReleaseRoundRollLock(supabase, round_id);
    }
  }

  // ── PLAYER ROLL ───────────────────────────────────────────────

  if (r.status === "player_rolling") {
    if (r.banker_point === null || r.banker_point === undefined) {
      return NextResponse.json({ error: "No banker point set" }, { status: 400 });
    }

    const { data: playersData } = await supabase
      .from("celo_room_players")
      .select("user_id, entry_sc, bet_cents, seat_number")
      .eq("room_id", room_id)
      .eq("role", "player")
      .gt("entry_sc", 0)
      .order("seat_number", { ascending: true });

    let players = (playersData ?? []) as Array<{
      user_id: string;
      entry_sc?: number;
      bet_cents?: number;
      seat_number: number | null;
    }>;

    const bankCovered = Boolean(r.bank_covered);
    const coveredBy = r.covered_by != null ? String(r.covered_by) : null;
    if (bankCovered && coveredBy) {
      players = players.filter((p) => p.user_id === coveredBy);
    }

    const currentSeat = Number(r.current_player_seat ?? players[0]?.seat_number ?? 1);
    const currentPlayer =
      players.find((p) => Number(p.seat_number ?? 0) === currentSeat) ?? players[0];

    if (!currentPlayer) {
      return NextResponse.json({ error: "No player found for this seat" }, { status: 400 });
    }

    if (currentPlayer.user_id !== userId) {
      return NextResponse.json({ error: "Not your turn" }, { status: 403 });
    }

    const playerEntry = currentPlayer.entry_sc ?? currentPlayer.bet_cents ?? 0;

    const { count: rerollCount } = await supabase
      .from("celo_player_rolls")
      .select("*", { count: "exact", head: true })
      .eq("round_id", round_id)
      .eq("user_id", userId)
      .eq("outcome", "reroll");

    const lock = await celoAcquireRoundRollLock(supabase, round_id, userId, {});
    if (!lock.ok) {
      console.warn("[celo/roll] duplicate roll blocked (player)", { round_id, userId });
      return NextResponse.json({ error: "Roll already in progress" }, { status: 409 });
    }

    try {
    const dice = rollThreeDice();
    const roll = evaluateRoll(dice);
    console.info("[celo/roll] player dice", { round_id, userId, dice, result: roll.result });

    if (roll.result === "no_count") {
      const { data: prInsert, error: prInsErr } = await supabase
        .from("celo_player_rolls")
        .insert({
          round_id,
          room_id,
          user_id: userId,
          dice,
          roll_name: roll.rollName,
          roll_result: roll.result,
          entry_sc: playerEntry,
          outcome: "reroll",
          payout_sc: 0,
          platform_fee_sc: 0,
          reroll_count: (rerollCount ?? 0) + 1,
          roll_animation_start_at: now,
          roll_animation_duration_ms: CELO_ROLL_ANIMATION_DURATION_MS,
        })
        .select("id")
        .single();
      let noCountAnimation: ReturnType<typeof buildCeloRollStartedPayload> | undefined;
      if (!prInsErr && prInsert?.id) {
        console.info("[celo/roll] player reroll row saved", { player_roll_id: prInsert.id });
        noCountAnimation = buildCeloRollStartedPayload({
          roomId: room_id,
          roundId: round_id,
          dice: dice as [number, number, number],
          kind: "player",
          playerRollId: prInsert.id,
          rollerUserId: userId,
          serverStartTime: now,
          rollName: roll.rollName,
          outcome: "reroll",
        });
        const b2 = await broadcastCeloRoomEvent(supabase, room_id, "roll_started", noCountAnimation);
        if (!b2) console.warn("[celo/roll] roll_started broadcast failed (player reroll)");
      }

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "no_count",
        animation: noCountAnimation,
        player_roll_id: prInsert?.id ?? null,
      });
    }

    let playerWins = resolvePlayerVsBankerPoint(Number(r.banker_point), roll) === "player_wins";
    let payoutSC = 0;
    let feeSC = 0;

    if (playerWins) {
      const calc = calculatePayout(playerEntry, "win", feePct);
      payoutSC = calc.payoutSC;
      feeSC = calc.feeSC;

      const led = await celoWalletCredit(supabase, userId, payoutSC, `celo_player_win_${round_id}_${userId}`);
      if (!led.success) {
        return NextResponse.json(
          { error: "payout", message: led.message ?? "Payout failed" },
          { status: 500 }
        );
      }

      if (feeSC > 0) {
        await insertCeloPlatformFee(supabase, round_id, feeSC, roll.rollName, {
          userId,
          description: `C-Lo player win fee - round ${round_id}`,
        });
      }

      await supabase
        .from("celo_rooms")
        .update(mergeCeloRoomUpdate(rm.current_bank_cents, { last_activity: now }))
        .eq("id", room_id);
    } else {
      const bankerNet = Math.floor((playerEntry * (100 - feePct)) / 100);
      feeSC = playerEntry - bankerNet;

      const led = await celoWalletCredit(
        supabase,
        bankerId,
        bankerNet,
        `celo_banker_win_point_${round_id}_${userId}`
      );
      if (!led.success) {
        return NextResponse.json(
          { error: "payout", message: led.message ?? "Payout failed" },
          { status: 500 }
        );
      }

      if (feeSC > 0) {
        await insertCeloPlatformFee(supabase, round_id, feeSC, roll.rollName, {
          description: `C-Lo platform fee (banker point win) - ${roll.rollName}`,
        });
      }

      const newBank = rm.current_bank_cents + bankerNet;
      await supabase
        .from("celo_rooms")
        .update(mergeCeloRoomUpdate(newBank, { last_activity: now }))
        .eq("id", room_id);
    }

    const { data: prResolving, error: prResErr } = await supabase
      .from("celo_player_rolls")
      .insert({
        round_id,
        room_id,
        user_id: userId,
        dice,
        roll_name: roll.rollName,
        roll_result: roll.result,
        point: roll.result === "point" ? roll.point : null,
        entry_sc: playerEntry,
        outcome: playerWins ? "win" : "loss",
        payout_sc: payoutSC,
        platform_fee_sc: feeSC,
        reroll_count: rerollCount ?? 0,
        player_celo_at: roll.isCelo ? now : null,
        roll_animation_start_at: now,
        roll_animation_duration_ms: CELO_ROLL_ANIMATION_DURATION_MS,
      })
      .select("id")
      .single();
    let resolvingAnimation: ReturnType<typeof buildCeloRollStartedPayload> | undefined;
    if (!prResErr && playerWins && roll.isCelo) {
      await supabase
        .from("celo_rounds")
        .update({
          player_celo_offer: true,
          player_celo_expires_at: new Date(Date.now() + 30_000).toISOString(),
        })
        .eq("id", round_id);
    }

    if (!prResErr && prResolving?.id) {
      console.info("[celo/roll] player resolving row saved", { player_roll_id: prResolving.id });
      resolvingAnimation = buildCeloRollStartedPayload({
        roomId: room_id,
        roundId: round_id,
        dice: dice as [number, number, number],
        kind: "player",
        playerRollId: prResolving.id,
        rollerUserId: userId,
        serverStartTime: now,
        rollName: roll.rollName,
        outcome: playerWins ? "win" : "loss",
      });
      const b3 = await broadcastCeloRoomEvent(supabase, room_id, "roll_started", resolvingAnimation);
      if (!b3) console.warn("[celo/roll] roll_started broadcast failed (player resolving)");
    }

    const currentIdx = players.findIndex((p) => Number(p.seat_number ?? 0) === currentSeat);
    const nextPlayer = players[currentIdx + 1];

    if (nextPlayer) {
      await supabase
        .from("celo_rounds")
        .update({ current_player_seat: nextPlayer.seat_number })
        .eq("id", round_id);

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: roll.result,
        point: roll.point,
        outcome: playerWins ? "win" : "loss",
        payoutSC,
        feeSC,
        nextPlayerSeat: nextPlayer.seat_number,
        roundComplete: false,
        animation: resolvingAnimation,
        player_roll_id: prResolving?.id ?? null,
        player_can_become_banker: Boolean(playerWins && roll.isCelo),
      });
    }

    await supabase
      .from("celo_rounds")
      .update({
        status: "completed",
        completed_at: now,
        updated_at: new Date().toISOString(),
      })
      .eq("id", round_id);

    await supabase.from("celo_rooms").update({ status: "active", last_activity: now }).eq("id", room_id);

    return NextResponse.json({
      dice,
      rollName: roll.rollName,
      result: roll.result,
      point: roll.point,
      outcome: playerWins ? "win" : "loss",
      payoutSC,
      feeSC,
      roundComplete: true,
      animation: resolvingAnimation,
      player_roll_id: prResolving?.id ?? null,
      player_can_become_banker: Boolean(playerWins && roll.isCelo),
    });
    } finally {
      await celoReleaseRoundRollLock(supabase, round_id);
    }
  }

  return NextResponse.json({ error: "Round is not in a rollable state" }, { status: 400 });
}
