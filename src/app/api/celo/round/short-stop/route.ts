import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { creditGPay } from "@/lib/gpay-balance";

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: { room_id?: string; round_id?: string; target?: string };
  try {
    body = (await req.json()) as { room_id?: string; round_id?: string; target?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { room_id, round_id, target } = body;
  if (!room_id || !round_id || !target) {
    return NextResponse.json({ error: "room_id, round_id, and target required" }, { status: 400 });
  }

  const { data: roomRows } = await supabase.from("celo_rooms").select("*").eq("id", room_id).limit(1);
  const room = celoFirstRow(roomRows);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const { data: roundRows } = await supabase.from("celo_rounds").select("*").eq("id", round_id).limit(1);
  const round = celoFirstRow(roundRows);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const r = round as Record<string, unknown>;
  const rm = room as Record<string, unknown>;

  const bankerId = String(rm.banker_id ?? "");

  // SHORT STOP ON BANKER ROLL — only bank-covering player (round flags)
  if (target === "banker") {
    const bankCovered = Boolean(r.bank_covered);
    const coveredBy = r.covered_by ? String(r.covered_by) : null;
    if (!bankCovered || coveredBy !== userId) {
      return NextResponse.json(
        { error: "Only the bank-covering player can short stop the banker" },
        { status: 403 }
      );
    }

    if (r.status !== "banker_rolling") {
      return NextResponse.json({ error: "Banker is not currently rolling" }, { status: 400 });
    }

    const noShortStop = Boolean(rm.no_short_stop ?? r.no_short_stop);

    if (noShortStop) {
      const { data: playerDataRows } = await supabase
        .from("celo_room_players")
        .select("entry_sc, bet_cents")
        .eq("room_id", room_id)
        .eq("user_id", userId)
        .limit(1);

      const playerData = celoFirstRow(playerDataRows) as
        | { entry_sc?: number; bet_cents?: number }
        | undefined;
      const entry = playerData?.entry_sc ?? playerData?.bet_cents ?? 0;

      await supabase.from("celo_player_rolls").insert({
        round_id,
        room_id,
        user_id: userId,
        dice: [1, 2, 3],
        roll_name: "Short Stop Denied — Auto Loss",
        roll_result: "instant_loss",
        entry_sc: entry,
        outcome: "loss",
        payout_sc: 0,
        platform_fee_sc: 0,
        reroll_count: 0,
      });

      const bankerNet = Math.floor(entry * 0.9);
      await creditGPay(bankerId, bankerNet, {
        description: "C-Lo short stop penalty",
        reference: `celo_short_stop_penalty_${round_id}_${userId}`,
      });

      return NextResponse.json({
        result: "auto_loss",
        reason: "no_short_stop_rule",
        message: "Short stop denied! You automatically lose your entry.",
      });
    }

    await supabase
      .from("celo_rounds")
      .update({
        banker_dice: null,
        banker_dice_name: "Short Stop — No Count",
        banker_dice_result: "no_count",
        banker_rerolls: Number(r.banker_rerolls ?? 0) + 1,
      })
      .eq("id", round_id);

    return NextResponse.json({
      result: "no_count",
      message: "Short stop! Banker must reroll.",
    });
  }

  if (target === "player") {
    if (userId !== bankerId) {
      return NextResponse.json({ error: "Only the banker can short stop a player" }, { status: 403 });
    }

    if (r.status !== "player_rolling") {
      return NextResponse.json({ error: "No player is currently rolling" }, { status: 400 });
    }

    const currentSeat = r.current_player_seat;

    const { data: currentPlayerRows } = await supabase
      .from("celo_room_players")
      .select("user_id, entry_sc, bet_cents")
      .eq("room_id", room_id)
      .eq("seat_number", currentSeat)
      .limit(1);

    const cp = celoFirstRow(currentPlayerRows) as
      | { user_id?: string; entry_sc?: number; bet_cents?: number }
      | undefined;
    const entry = cp?.entry_sc ?? cp?.bet_cents ?? 0;

    await supabase.from("celo_player_rolls").insert({
      round_id,
      room_id,
      user_id: cp?.user_id ?? userId,
      dice: [0, 0, 0],
      roll_name: "Short Stop — No Count",
      roll_result: "no_count",
      entry_sc: entry,
      outcome: "reroll",
      payout_sc: 0,
      platform_fee_sc: 0,
      reroll_count: 0,
    });

    return NextResponse.json({
      result: "no_count",
      message: "Short stop! Player must reroll.",
    });
  }

  return NextResponse.json({ error: "Invalid target" }, { status: 400 });
}
