import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry, getCanonicalBalanceCents } from "@/lib/wallet-ledger";
import { rollThreeDice, evaluateRoll, comparePoints, calculatePayout } from "@/lib/celo-engine";
import { normalizeCeloRoomRow, mergeCeloRoomUpdate } from "@/lib/celo-room-schema";

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

  // ── BANKER ROLL ──────────────────────────────────────────────

  if (r.status === "banker_rolling") {
    if (userId !== bankerId) {
      return NextResponse.json({ error: "Not your turn" }, { status: 403 });
    }

    const dice = rollThreeDice();
    const roll = evaluateRoll(dice);

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

    let firstSeat = 1;
    if (roll.result === "point" && players.length > 0) {
      firstSeat = players[0]?.seat_number || 1;
    }

    await supabase
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
          roll.result === "instant_win" || roll.result === "instant_loss" ? now : null,
        banker_rerolls: Number(r.banker_rerolls ?? 0) + (roll.result === "no_count" ? 1 : 0),
      })
      .eq("id", round_id);

    if (roll.result === "no_count") {
      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "no_count",
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
        const led = await walletLedgerEntry(
          bankerId,
          "game_win",
          bankerWins,
          `celo_banker_win_${round_id}`
        );
        if (!("success" in led) || !led.success) {
          return NextResponse.json(
            { error: "ledger", message: "message" in led ? led.message : "Payout failed" },
            { status: 500 }
          );
        }
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
      });
    }

    if (roll.result === "instant_loss") {
      let totalPaidOut = 0;

      for (const player of players) {
        const entry = player.entry_sc ?? player.bet_cents ?? 0;
        if (entry <= 0) continue;

        const { payoutSC } = calculatePayout(entry, "win", feePct);

        const led = await walletLedgerEntry(
          player.user_id,
          "game_win",
          payoutSC,
          `celo_player_win_${round_id}_${player.user_id}`
        );
        if (!("success" in led) || !led.success) {
          return NextResponse.json(
            { error: "ledger", message: "message" in led ? led.message : "Payout failed" },
            { status: 500 }
          );
        }
        totalPaidOut += payoutSC;
      }

      let newBank = Math.max(0, rm.current_bank_cents - totalPaidOut);

      let bankerBroke = false;
      let newBankerId = bankerId;

      if (newBank < rm.min_bet_cents) {
        bankerBroke = true;
        const { data: allPlayers } = await supabase
          .from("celo_room_players")
          .select("user_id, seat_number")
          .eq("room_id", room_id)
          .neq("user_id", bankerId)
          .order("seat_number", { ascending: true });

        for (const p of allPlayers ?? []) {
          const row = p as { user_id: string };
          const bal = await getCanonicalBalanceCents(row.user_id);
          if (bal >= newBank) {
            newBankerId = row.user_id;
            await supabase
              .from("celo_room_players")
              .update({ role: "player" })
              .eq("room_id", room_id)
              .eq("user_id", bankerId);
            await supabase
              .from("celo_room_players")
              .update({ role: "banker" })
              .eq("room_id", room_id)
              .eq("user_id", newBankerId);
            await supabase.from("celo_rooms").update({ banker_id: newBankerId }).eq("id", room_id);
            break;
          }
        }

        if (newBankerId === bankerId) {
          await supabase.from("celo_rooms").update({ status: "cancelled" }).eq("id", room_id);
        }
      }

      await supabase
        .from("celo_rooms")
        .update(
          mergeCeloRoomUpdate(newBank, {
            status: bankerBroke && newBankerId === bankerId ? "cancelled" : "active",
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
        newBankSC: newBank,
        bankerStays: true,
        bankerBroke,
        newBankerId,
      });
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

    const players = (playersData ?? []) as Array<{
      user_id: string;
      entry_sc?: number;
      bet_cents?: number;
      seat_number: number | null;
    }>;

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

    const dice = rollThreeDice();
    const roll = evaluateRoll(dice);

    if (roll.result === "no_count") {
      await supabase.from("celo_player_rolls").insert({
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
      });

      return NextResponse.json({
        dice,
        rollName: roll.rollName,
        result: "no_count",
      });
    }

    let playerWins = false;
    let payoutSC = 0;
    let feeSC = 0;

    if (roll.result === "instant_win") {
      playerWins = true;
    } else if (roll.result === "instant_loss") {
      playerWins = false;
    } else if (roll.result === "point" && roll.point !== undefined) {
      playerWins =
        comparePoints(Number(r.banker_point), roll.point) === "player_wins";
    }

    if (playerWins) {
      const calc = calculatePayout(playerEntry, "win", feePct);
      payoutSC = calc.payoutSC;
      feeSC = calc.feeSC;

      const led = await walletLedgerEntry(
        userId,
        "game_win",
        payoutSC,
        `celo_player_win_${round_id}_${userId}`
      );
      if (!("success" in led) || !led.success) {
        return NextResponse.json(
          { error: "ledger", message: "message" in led ? led.message : "Payout failed" },
          { status: 500 }
        );
      }

      const newBank = Math.max(0, rm.current_bank_cents - playerEntry);
      await supabase
        .from("celo_rooms")
        .update(mergeCeloRoomUpdate(newBank, { last_activity: now }))
        .eq("id", room_id);
    } else {
      const bankerNet = Math.floor((playerEntry * (100 - feePct)) / 100);
      feeSC = playerEntry - bankerNet;

      const led = await walletLedgerEntry(
        bankerId,
        "game_win",
        bankerNet,
        `celo_banker_win_point_${round_id}_${userId}`
      );
      if (!("success" in led) || !led.success) {
        return NextResponse.json(
          { error: "ledger", message: "message" in led ? led.message : "Payout failed" },
          { status: 500 }
        );
      }

      const newBank = rm.current_bank_cents + bankerNet;
      await supabase
        .from("celo_rooms")
        .update(mergeCeloRoomUpdate(newBank, { last_activity: now }))
        .eq("id", room_id);
    }

    await supabase.from("celo_player_rolls").insert({
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
    });

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
      });
    }

    await supabase
      .from("celo_rounds")
      .update({
        status: "completed",
        completed_at: now,
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
    });
  }

  return NextResponse.json({ error: "Round is not in a rollable state" }, { status: 400 });
}
