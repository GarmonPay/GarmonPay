import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { creditGpayIdempotent, getUserCoins } from "@/lib/coins";
import {
  comparePoints,
  calculatePayout,
  evaluateRoll,
  rollThreeDice,
} from "@/lib/celo-engine";
import { insertCeloPlatformFee } from "@/lib/celo-platform-fee";
import {
  celoAccountingLog,
  celoUpdateRoundIfStatus,
} from "@/lib/celo-accounting";

type RoomRow = {
  id: string;
  banker_id: string;
  current_bank_sc: number;
  minimum_entry_sc: number | null;
  min_bet_cents: number | null;
  total_rounds: number;
  last_round_was_celo: boolean;
  banker_celo_at: string | null;
  platform_fee_pct: number;
};

type RoundRow = {
  id: string;
  room_id: string;
  status: string;
  banker_id: string | null;
  prize_pool_sc: number | null;
  platform_fee_sc: number | null;
  banker_point: number | null;
  current_player_seat: number | null;
  player_celo_offer?: boolean;
  player_celo_expires_at?: string | null;
};

type PlayerRow = {
  id: string;
  user_id: string;
  role: string;
  entry_sc: number;
  seat_number: number | null;
};

export async function POST(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const auth = await getCeloAuth(request, clients);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user, adminClient } = auth;
  const userId = user.id;
  let body: { room_id?: string; round_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "");
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  const { data: pRow, error: pErr } = await adminClient
    .from("celo_room_players")
    .select("id, user_id, role, entry_sc, seat_number")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (pErr || !pRow) {
    return NextResponse.json(
      { error: "You are not in this room" },
      { status: 403 }
    );
  }
  const player = pRow as PlayerRow;
  if (player.role === "spectator") {
    return NextResponse.json(
      { error: "Spectators cannot roll" },
      { status: 400 }
    );
  }
  const { data: roomRaw } = await adminClient
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .single();
  if (!roomRaw) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomRaw as RoomRow;
  const roundIdArg = body.round_id ? String(body.round_id) : null;
  let round: RoundRow | null = null;
  if (roundIdArg) {
    const { data: r } = await adminClient
      .from("celo_rounds")
      .select("*")
      .eq("id", roundIdArg)
      .eq("room_id", roomId)
      .maybeSingle();
    round = (r as RoundRow) ?? null;
  } else {
    const { data: r } = await adminClient
      .from("celo_rounds")
      .select("*")
      .eq("room_id", roomId)
      .in("status", ["banker_rolling", "player_rolling"])
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    round = (r as RoundRow) ?? null;
  }
  if (!round) {
    return NextResponse.json({ error: "No active round" }, { status: 400 });
  }
  const dice = rollThreeDice();
  const roll = evaluateRoll(dice);
  const feePct = room.platform_fee_pct ?? 10;
  if (player.role === "banker" || userId === room.banker_id) {
    if (round.status !== "banker_rolling") {
      return NextResponse.json({ error: "Not your turn" }, { status: 400 });
    }
    return handleBankerRoll(
      adminClient,
      { room, round, userId, dice, roll, feePct }
    );
  }
  if (player.role === "player") {
    if (round.status !== "player_rolling") {
      return NextResponse.json({ error: "Not your turn" }, { status: 400 });
    }
    if (Number(player.entry_sc) <= 0) {
      return NextResponse.json(
        { error: "No entry this round" },
        { status: 400 }
      );
    }
    const { data: finalRoll } = await adminClient
      .from("celo_player_rolls")
      .select("id")
      .eq("round_id", round.id)
      .eq("user_id", userId)
      .in("outcome", ["win", "loss"])
      .limit(1);
    if (finalRoll && finalRoll.length > 0) {
      return NextResponse.json({ error: "Already rolled" }, { status: 400 });
    }
    const seat = player.seat_number ?? 0;
    if (
      round.current_player_seat != null &&
      seat !== round.current_player_seat
    ) {
      return NextResponse.json(
        { error: "Not your turn to roll" },
        { status: 400 }
      );
    }
    return handlePlayerRoll(
      adminClient,
      { room, round, userId, player, dice, roll, feePct }
    );
  }
  return NextResponse.json({ error: "Cannot roll" }, { status: 400 });
}

async function handleBankerRoll(
  admin: SupabaseClient,
  ctx: {
    room: RoomRow;
    round: RoundRow;
    userId: string;
    dice: [number, number, number];
    roll: ReturnType<typeof evaluateRoll>;
    feePct: number;
  }
) {
  const { room, round, userId, dice, roll, feePct } = ctx;
  const now = new Date().toISOString();
  const diceArr = [dice[0], dice[1], dice[2]];

  if (roll.result === "no_count") {
    const updated = await celoUpdateRoundIfStatus(admin, round.id, ["banker_rolling"], {
      banker_dice: diceArr,
      banker_dice_name: roll.rollName,
      banker_dice_result: roll.result,
    });
    if (!updated) {
      celoAccountingLog("banker_no_count_skip", { roundId: round.id });
      const { data: cur } = await admin
        .from("celo_rounds")
        .select("status, banker_dice, banker_dice_name, banker_dice_result")
        .eq("id", round.id)
        .maybeSingle();
      if (cur?.status === "banker_rolling" && Array.isArray(cur.banker_dice)) {
        const d = cur.banker_dice as number[];
        return NextResponse.json({
          dice: [d[0], d[1], d[2]] as [number, number, number],
          rollName: cur.banker_dice_name,
          result: cur.banker_dice_result,
          outcome: "reroll",
          isCelo: roll.isCelo,
        });
      }
      return NextResponse.json(
        { error: "Round is not in banker rolling state" },
        { status: 409 }
      );
    }
    return NextResponse.json({
      dice,
      rollName: roll.rollName,
      result: roll.result,
      outcome: "reroll",
      isCelo: roll.isCelo,
    });
  }

  if (roll.result === "instant_win") {
    const prizePool = Math.max(0, Math.floor(Number(round.prize_pool_sc) || 0));
    const fee = Math.floor((prizePool * feePct) / 100);
    const bankerWins = Math.max(0, prizePool - fee);
    const payoutRef = `celo_round_banker_win_${round.id}`;

    celoAccountingLog("banker_instant_win_payout_attempt", {
      roundId: round.id,
      userId,
      bankerWins,
      reference: payoutRef,
    });
    const cr = await creditGpayIdempotent(
      userId,
      bankerWins,
      "C-Lo round (banker table)",
      payoutRef,
      "celo_payout"
    );
    if (!cr.success) {
      celoAccountingLog("banker_instant_win_payout_fail", {
        roundId: round.id,
        message: cr.message,
      });
      return NextResponse.json(
        { error: cr.message ?? "Credit failed" },
        { status: 500 }
      );
    }

    const { data: finalized, error: finErr } = await admin
      .from("celo_rounds")
      .update({
        banker_dice: diceArr,
        banker_dice_name: roll.rollName,
        banker_dice_result: roll.result,
        status: "completed",
        platform_fee_sc: fee,
        completed_at: now,
      })
      .eq("id", round.id)
      .eq("status", "banker_rolling")
      .select("id")
      .maybeSingle();

    if (finErr) {
      celoAccountingLog("banker_instant_win_finalize_err", {
        roundId: round.id,
        message: finErr.message,
      });
      return NextResponse.json(
        { error: finErr.message ?? "Finalize failed" },
        { status: 500 }
      );
    }

    if (!finalized) {
      const { data: cur } = await admin
        .from("celo_rounds")
        .select(
          "status, banker_dice, banker_dice_name, banker_dice_result, platform_fee_sc"
        )
        .eq("id", round.id)
        .maybeSingle();
      celoAccountingLog("banker_instant_win_finalize_skip", {
        roundId: round.id,
        status: cur?.status,
      });
      if (
        cur?.status === "completed" &&
        cur.banker_dice_result === "instant_win"
      ) {
        const { data: roomFresh } = await admin
          .from("celo_rooms")
          .select("current_bank_sc")
          .eq("id", room.id)
          .maybeSingle();
        const nb = Math.max(
          0,
          Math.floor(
            Number((roomFresh as { current_bank_sc?: number })?.current_bank_sc) ||
              room.current_bank_sc
          )
        );
        return NextResponse.json({
          idempotent: true,
          dice: Array.isArray(cur.banker_dice)
            ? (cur.banker_dice as [number, number, number])
            : dice,
          rollName: cur.banker_dice_name ?? roll.rollName,
          result: cur.banker_dice_result,
          outcome: "banker_wins",
          isCelo: roll.isCelo,
          bankerWins,
          newBank: nb,
          canLowerBank: roll.isCelo,
        });
      }
      return NextResponse.json(
        { error: "Could not finalize round after payout" },
        { status: 500 }
      );
    }

    await insertCeloPlatformFee(
      admin,
      fee,
      `C-Lo platform fee (round ${round.id})`,
      {
        userId,
        roundId: round.id,
        idempotencyKey: `celo_pf_${round.id}_banker_table`,
      }
    );
    const newBank = Math.max(0, room.current_bank_sc + bankerWins);
    await admin
      .from("celo_rooms")
      .update({
        current_bank_sc: newBank,
        last_round_was_celo: roll.isCelo,
        banker_celo_at: roll.isCelo ? now : room.banker_celo_at,
        total_rounds: (room.total_rounds ?? 0) + 1,
        last_activity: now,
      })
      .eq("id", room.id);
    await resetRoomEntries(admin, room.id);
    celoAccountingLog("banker_instant_win_done", {
      roundId: round.id,
      newBank,
      reference: payoutRef,
    });
    return NextResponse.json({
      dice,
      rollName: roll.rollName,
      result: roll.result,
      outcome: "banker_wins",
      isCelo: roll.isCelo,
      bankerWins,
      newBank,
      canLowerBank: roll.isCelo,
    });
  }

  if (roll.result === "instant_loss") {
    const { data: staked } = await admin
      .from("celo_room_players")
      .select("user_id, entry_sc, role")
      .eq("room_id", room.id);

    for (const p of staked ?? []) {
      if (p.role !== "player") continue;
      const e = Math.max(0, Math.floor(Number(p.entry_sc) || 0));
      if (e <= 0) continue;
      const { net, fee } = calculatePayout(e, feePct);
      const ref = `celo_round_players_win_${round.id}_${p.user_id}`;
      celoAccountingLog("instant_loss_payout_attempt", {
        roundId: round.id,
        userId: p.user_id,
        net,
        reference: ref,
      });
      const c = await creditGpayIdempotent(
        p.user_id,
        net,
        "C-Lo round (players earn vs banker loss)",
        ref,
        "celo_payout"
      );
      if (!c.success) {
        celoAccountingLog("instant_loss_payout_fail", {
          roundId: round.id,
          userId: p.user_id,
          message: c.message,
        });
        return NextResponse.json(
          { error: c.message ?? "Player payout failed" },
          { status: 500 }
        );
      }
      await insertCeloPlatformFee(
        admin,
        fee,
        `C-Lo fee (round ${round.id} player)`,
        {
          userId: p.user_id,
          roundId: round.id,
          idempotencyKey: `celo_pf_${round.id}_instant_loss_${p.user_id}`,
        }
      );
    }

    const { data: finalized } = await admin
      .from("celo_rounds")
      .update({
        banker_dice: diceArr,
        banker_dice_name: roll.rollName,
        banker_dice_result: roll.result,
        status: "completed",
        completed_at: now,
      })
      .eq("id", round.id)
      .eq("status", "banker_rolling")
      .select("id")
      .maybeSingle();

    if (!finalized) {
      const { data: cur } = await admin
        .from("celo_rounds")
        .select("status, banker_dice, banker_dice_name, banker_dice_result")
        .eq("id", round.id)
        .maybeSingle();
      celoAccountingLog("instant_loss_finalize_skip", {
        roundId: round.id,
        status: cur?.status,
      });
      if (
        cur?.status === "completed" &&
        cur.banker_dice_result === "instant_loss"
      ) {
        return NextResponse.json({
          idempotent: true,
          dice: Array.isArray(cur.banker_dice)
            ? (cur.banker_dice as [number, number, number])
            : dice,
          rollName: cur.banker_dice_name ?? roll.rollName,
          result: cur.banker_dice_result,
          outcome: "players_win",
        });
      }
      return NextResponse.json(
        { error: "Could not finalize round after payouts" },
        { status: 500 }
      );
    }

    await admin
      .from("celo_rooms")
      .update({
        last_round_was_celo: false,
        total_rounds: (room.total_rounds ?? 0) + 1,
        last_activity: now,
      })
      .eq("id", room.id);
    await resetRoomEntries(admin, room.id);
    celoAccountingLog("instant_loss_done", { roundId: round.id });
    return NextResponse.json({
      dice,
      rollName: roll.rollName,
      result: roll.result,
      outcome: "players_win",
    });
  }

  if (roll.result === "point" && roll.point != null) {
    const staked = await getStakedPlayersOrdered(admin, room.id);
    const firstSeat = staked[0]?.seat_number ?? 1;
    const updated = await celoUpdateRoundIfStatus(admin, round.id, ["banker_rolling"], {
      banker_dice: diceArr,
      banker_dice_name: roll.rollName,
      banker_dice_result: roll.result,
      banker_point: roll.point,
      status: "player_rolling",
      current_player_seat: firstSeat,
    });
    if (!updated) {
      const { data: cur } = await admin
        .from("celo_rounds")
        .select(
          "status, banker_point, banker_dice, banker_dice_name, banker_dice_result, current_player_seat"
        )
        .eq("id", round.id)
        .maybeSingle();
      celoAccountingLog("banker_point_transition_skip", {
        roundId: round.id,
        status: cur?.status,
      });
      if (cur?.status === "player_rolling") {
        return NextResponse.json({
          idempotent: true,
          dice: Array.isArray(cur.banker_dice)
            ? (cur.banker_dice as [number, number, number])
            : dice,
          rollName: cur.banker_dice_name ?? roll.rollName,
          result: cur.banker_dice_result,
          point: cur.banker_point,
          outcome: "players_must_roll",
        });
      }
      return NextResponse.json(
        { error: "Round is not in banker rolling state" },
        { status: 409 }
      );
    }
    return NextResponse.json({
      dice,
      rollName: roll.rollName,
      result: roll.result,
      point: roll.point,
      outcome: "players_must_roll",
    });
  }
  return NextResponse.json(
    { error: "Unexpected banker roll state" },
    { status: 500 }
  );
}

async function handlePlayerRoll(
  admin: SupabaseClient,
  ctx: {
    room: RoomRow;
    round: RoundRow;
    userId: string;
    player: PlayerRow;
    dice: [number, number, number];
    roll: ReturnType<typeof evaluateRoll>;
    feePct: number;
  }
) {
  const { room, round, userId, player, dice, roll, feePct } = ctx;
  const now = new Date().toISOString();
  const bankerPoint = round.banker_point;
  if (bankerPoint == null) {
    return NextResponse.json(
      { error: "Banker has not set a point" },
      { status: 400 }
    );
  }
  const entry = Math.max(0, Math.floor(Number(player.entry_sc) || 0));
  let outcome: "win" | "loss" | "reroll" = "loss";
  let payoutSc = 0;
  let playerCanBecomeBanker = false;
  if (roll.result === "instant_win") {
    const { net, fee } = calculatePayout(entry, feePct);
    const winRef = `celo_player_win_${round.id}_${userId}`;
    celoAccountingLog("player_roll_instant_win_payout_attempt", {
      roundId: round.id,
      userId,
      net,
      reference: winRef,
    });
    const c = await creditGpayIdempotent(
      userId,
      net,
      "C-Lo player roll (instant win)",
      winRef,
      "celo_payout"
    );
    if (!c.success) {
      return NextResponse.json(
        { error: c.message ?? "Credit failed" },
        { status: 500 }
      );
    }
    await insertCeloPlatformFee(
      admin,
      fee,
      `C-Lo fee (player win ${round.id})`,
      {
        userId,
        roundId: round.id,
        idempotencyKey: `celo_pf_${round.id}_player_win_${userId}`,
      }
    );
    outcome = "win";
    payoutSc = net;
    playerCanBecomeBanker = roll.isCelo;
    if (roll.isCelo) {
      await admin
        .from("celo_rounds")
        .update({
          player_celo_offer: true,
          player_celo_expires_at: new Date(
            Date.now() + 30_000
          ).toISOString(),
        })
        .eq("id", round.id);
    }
  } else if (roll.result === "instant_loss") {
    outcome = "loss";
  } else if (roll.result === "point" && roll.point != null) {
    const cmp = comparePoints(roll.point, bankerPoint);
    if (cmp === "win") {
      const { net, fee } = calculatePayout(entry, feePct);
      const ptRef = `celo_player_point_${round.id}_${userId}`;
      celoAccountingLog("player_roll_point_win_payout_attempt", {
        roundId: round.id,
        userId,
        net,
        reference: ptRef,
      });
      const pc = await creditGpayIdempotent(
        userId,
        net,
        "C-Lo player point win",
        ptRef,
        "celo_payout"
      );
      if (!pc.success) {
        return NextResponse.json(
          { error: pc.message ?? "Credit failed" },
          { status: 500 }
        );
      }
      await insertCeloPlatformFee(
        admin,
        fee,
        `C-Lo fee (point win ${round.id})`,
        {
          userId,
          roundId: round.id,
          idempotencyKey: `celo_pf_${round.id}_point_win_${userId}`,
        }
      );
      outcome = "win";
      payoutSc = net;
    } else {
      outcome = "loss";
    }
  } else {
    outcome = "reroll";
  }
  if (outcome !== "reroll") {
    const diceArr = [dice[0], dice[1], dice[2]];
    await admin.from("celo_player_rolls").insert({
      round_id: round.id,
      room_id: room.id,
      user_id: userId,
      dice: diceArr,
      roll_name: roll.rollName,
      roll_result: roll.result,
      point: roll.point,
      entry_sc: entry,
      outcome,
      payout_sc: payoutSc,
      platform_fee_sc:
        outcome === "win" ? Math.floor((entry * 2 * feePct) / 100) : 0,
    });
    await admin
      .from("celo_room_players")
      .update({ entry_sc: 0, bet_cents: 0 })
      .eq("id", player.id);
  }
  let newBalance: number | undefined;
  if (outcome !== "reroll") {
    const { gpayCoins } = await getUserCoins(userId);
    newBalance = gpayCoins;
  }
  let hasMore = true;
  if (outcome !== "reroll") {
    const { data: left } = await admin
      .from("celo_room_players")
      .select("entry_sc, role, seat_number")
      .eq("room_id", room.id)
      .eq("role", "player");
    const anyLeft = (left ?? []).some(
      (p) => Math.floor(Number(p.entry_sc) || 0) > 0
    );
    if (!anyLeft) {
      hasMore = false;
      const { data: finalized } = await admin
        .from("celo_rounds")
        .update({ status: "completed", completed_at: now })
        .eq("id", round.id)
        .eq("status", "player_rolling")
        .select("id")
        .maybeSingle();
      if (finalized) {
        await admin
          .from("celo_rooms")
          .update({
            total_rounds: (room.total_rounds ?? 0) + 1,
            last_activity: now,
          })
          .eq("id", room.id);
        celoAccountingLog("player_phase_settlement_complete", {
          roundId: round.id,
        });
      } else {
        const { data: cur } = await admin
          .from("celo_rounds")
          .select("status")
          .eq("id", round.id)
          .maybeSingle();
        celoAccountingLog("player_phase_settlement_skip", {
          roundId: round.id,
          status: cur?.status,
        });
      }
    } else {
      const staked = await getStakedPlayersOrdered(admin, room.id);
      const next = staked[0];
      await admin
        .from("celo_rounds")
        .update({
          current_player_seat: next?.seat_number ?? null,
        })
        .eq("id", round.id);
    }
  }
  return NextResponse.json({
    dice,
    rollName: roll.rollName,
    result: roll.result,
    point: roll.point,
    outcome: outcome === "reroll" ? "reroll" : outcome,
    payoutSc: outcome === "reroll" ? 0 : payoutSc,
    newBalance,
    player_can_become_banker: playerCanBecomeBanker,
    player_must_have_sc: room.current_bank_sc,
    isCelo: roll.isCelo,
    roundComplete: outcome === "reroll" ? false : !hasMore,
  });
}

async function resetRoomEntries(admin: SupabaseClient, roomId: string) {
  await admin
    .from("celo_room_players")
    .update({ entry_sc: 0, bet_cents: 0 })
    .eq("room_id", roomId);
}

async function getStakedPlayersOrdered(
  admin: SupabaseClient,
  roomId: string
): Promise<Pick<PlayerRow, "user_id" | "entry_sc" | "seat_number">[]> {
  const { data } = await admin
    .from("celo_room_players")
    .select("user_id, entry_sc, seat_number, role")
    .eq("room_id", roomId);
  return (data ?? [])
    .filter(
      (p) =>
        p.role === "player" && Math.floor(Number(p.entry_sc) || 0) > 0
    )
    .sort(
      (a, b) =>
        (a.seat_number ?? 999) - (b.seat_number ?? 999)
    ) as PlayerRow[];
}
