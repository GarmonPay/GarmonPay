import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { deductGPay, creditGPay, getGPayBalance } from "@/lib/gpay-balance";
import { normalizeCeloRoomRow, mergeCeloRoomUpdate, CELO_ROOMS_COL } from "@/lib/celo-room-schema";
import { sumPlayerTableStakesCents } from "@/lib/celo-banker-reserve";
import { celoQaLog } from "@/lib/celo-qa-log";

const ADJUST_WINDOW_MS = 60_000;
const ABS_MIN_BET_SC = 500;

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

  const raw = body as {
    room_id?: string;
    new_bank_sc?: number;
    new_bank_cents?: number;
    new_minimum_sc?: number;
    new_minimum_cents?: number;
  };

  const room_id = raw.room_id;
  const new_bank_sc = Number(raw.new_bank_sc ?? raw.new_bank_cents);
  const new_minimum_sc = Number(raw.new_minimum_sc ?? raw.new_minimum_cents);

  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  if (!Number.isFinite(new_bank_sc) || new_bank_sc <= 0) {
    return NextResponse.json({ error: "new_bank_sc required (positive number)" }, { status: 400 });
  }
  if (!Number.isFinite(new_minimum_sc) || new_minimum_sc < ABS_MIN_BET_SC) {
    return NextResponse.json(
      { error: `new_minimum_sc must be at least ${ABS_MIN_BET_SC} ($5.00)` },
      { status: 400 }
    );
  }

  if (new_bank_sc < new_minimum_sc) {
    return NextResponse.json(
      { error: "Bank must be greater than or equal to minimum entry" },
      { status: 400 }
    );
  }

  const { data: roomRows } = await supabase.from("celo_rooms").select("*").eq("id", room_id).limit(1);
  const room = celoFirstRow(roomRows);

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const rm = normalizeCeloRoomRow(room as Record<string, unknown>) as {
    banker_id: string;
    current_bank_cents: number;
    banker_reserve_cents: number;
    min_bet_cents: number;
    last_round_was_celo?: boolean;
    banker_celo_at?: string | null;
    status: string;
  };

  if (rm.banker_id !== userId) {
    return NextResponse.json({ error: "Only the banker can adjust the bank" }, { status: 403 });
  }

  if (!rm.last_round_was_celo || rm.banker_celo_at == null) {
    return NextResponse.json(
      { error: "Bank can only be adjusted immediately after rolling C-Lo" },
      { status: 400 }
    );
  }

  const celoAt = new Date(rm.banker_celo_at).getTime();
  if (Date.now() - celoAt > ADJUST_WINDOW_MS) {
    return NextResponse.json(
      { error: "C-Lo bank adjustment window has expired (60 seconds)" },
      { status: 400 }
    );
  }

  const currentBank = rm.current_bank_cents;
  const delta = new_bank_sc - currentBank;

  if (delta >= 0) {
    return NextResponse.json(
      { error: "Bank can only be lowered after C-Lo, not raised or unchanged" },
      { status: 400 }
    );
  }

  if (new_bank_sc % rm.min_bet_cents !== 0) {
    return NextResponse.json(
      {
        error: `Bank must be a whole multiple of minimum entry (${rm.min_bet_cents} GPC)`,
      },
      { status: 400 }
    );
  }

  const { data: stakeRows, error: stakeErr } = await supabase
    .from("celo_room_players")
    .select("bet_cents, entry_sc")
    .eq("room_id", room_id)
    .eq("role", "player");

  if (stakeErr) {
    return NextResponse.json({ error: "Could not validate player entries" }, { status: 500 });
  }

  const sumStakes = sumPlayerTableStakesCents(
    (stakeRows ?? []) as { bet_cents?: number | null; entry_sc?: number | null }[]
  );
  const newReserve = rm.banker_reserve_cents + delta;
  if (newReserve < 0) {
    return NextResponse.json({ error: "Invalid bank adjustment" }, { status: 400 });
  }
  if (newReserve < sumStakes) {
    celoQaLog("lower_bank_reserve_rejected", {
      roomId: room_id,
      previousReserveCents: rm.banker_reserve_cents,
      newReserveCents: newReserve,
      sumPlayerStakesCents: sumStakes,
      deltaCents: delta,
      httpStatus: 400,
    });
    return NextResponse.json(
      {
        error:
          "Cannot adjust bank: reserved liability would fall below total committed player entries (integer US cents).",
      },
      { status: 400 }
    );
  }

  if (delta < 0) {
    const credit = await creditGPay(userId, -delta, {
      description: "C-Lo bank lower",
      reference: `celo_bank_lower_${room_id}_${Date.now()}`,
    });
    if (!credit.ok) {
      return NextResponse.json(
        { error: credit.message ?? "Failed to return bank funds" },
        { status: 500 }
      );
    }
  }

  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from("celo_rooms")
    .update({
      ...mergeCeloRoomUpdate(new_bank_sc, {
        [CELO_ROOMS_COL.minimumEntry]: new_minimum_sc,
        [CELO_ROOMS_COL.bankerReserve]: newReserve,
        last_round_was_celo: false,
        banker_celo_at: null,
        last_activity: now,
      }),
    })
    .eq("id", room_id);

  if (upErr) {
    console.error("[celo/room/lower-bank] update:", upErr);
    return NextResponse.json({ error: "Failed to update room" }, { status: 500 });
  }

  await supabase.from("celo_audit_log").insert({
    room_id,
    user_id: userId,
    action: "bank_adjusted",
    details: {
      previous_bank_cents: currentBank,
      new_bank_cents: new_bank_sc,
      previous_reserve_cents: rm.banker_reserve_cents,
      new_reserve_cents: newReserve,
      previous_minimum_cents: rm.min_bet_cents,
      new_minimum_cents: new_minimum_sc,
      delta_cents: delta,
      sum_player_stakes_cents: sumStakes,
    },
  });

  const { data: updatedRows } = await supabase.from("celo_rooms").select("*").eq("id", room_id).limit(1);
  const updated = celoFirstRow(updatedRows);

  return NextResponse.json({
    room: updated,
    new_bank_sc,
    new_minimum_sc,
  });
}
