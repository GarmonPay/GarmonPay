import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { debitGpayCoins, getUserCoins } from "@/lib/coins";

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: { room_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.room_id === "string" ? body.room_id : null;
  if (!roomId) return NextResponse.json({ message: "room_id required" }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: roomRaw, error: rErr } = await supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();
  if (rErr || !roomRaw) return NextResponse.json({ message: "Room not found" }, { status: 404 });

  const room = roomRaw as Record<string, unknown>;
  const bank = Math.floor(Number(room.current_bank_sc ?? room.current_bank_cents ?? 0));
  if (bank <= 0) return NextResponse.json({ message: "Invalid bank" }, { status: 400 });

  const { data: mem } = await supabase
    .from("celo_room_players")
    .select("role, entry_sc")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!mem || String((mem as { role: string }).role) !== "player") {
    return NextResponse.json({ message: "Only seated players can cover the bank" }, { status: 403 });
  }

  if (Math.floor(Number((mem as { entry_sc?: number }).entry_sc ?? 0)) > 0) {
    return NextResponse.json({ message: "You already have an entry this round" }, { status: 400 });
  }

  const { data: others } = await supabase
    .from("celo_room_players")
    .select("user_id, entry_sc, role")
    .eq("room_id", roomId)
    .eq("role", "player")
    .neq("user_id", userId);

  const otherHasStake = (others ?? []).some((p) => Math.floor(Number((p as { entry_sc?: number }).entry_sc ?? 0)) > 0);
  if (otherHasStake) {
    return NextResponse.json({ message: "Another player already has a stake this round" }, { status: 400 });
  }

  const { data: roundRaw } = await supabase
    .from("celo_rounds")
    .select("*")
    .eq("room_id", roomId)
    .neq("status", "completed")
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!roundRaw) return NextResponse.json({ message: "No active round" }, { status: 400 });

  const round = roundRaw as Record<string, unknown>;
  if (String(round.status) !== "banker_rolling") {
    return NextResponse.json({ message: "Cover is only available before the banker rolls" }, { status: 400 });
  }

  if (round.bank_covered === true) {
    return NextResponse.json({ message: "The bank is already covered" }, { status: 400 });
  }

  if (round.roll_processing === true) {
    return NextResponse.json({ message: "Roll in progress" }, { status: 409 });
  }

  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < bank) {
    return NextResponse.json({ message: "Insufficient GPay Coins (GPC)" }, { status: 400 });
  }

  const debitRef = `celo_cover_bank_${roomId}_${round.id}_${userId}`;
  const debit = await debitGpayCoins(userId, bank, "C-Lo cover the bank", debitRef, "celo_entry");
  if (!debit.success) {
    return NextResponse.json({ message: debit.message ?? "Debit failed" }, { status: 400 });
  }

  const prizePool = Math.floor(Number(round.prize_pool_sc ?? 0));
  const newPool = prizePool + bank;
  const newFee = Math.floor((newPool * 10) / 100);

  const { data: updatedRound, error: uRoundErr } = await supabase
    .from("celo_rounds")
    .update({
      bank_covered: true,
      covered_by: userId,
      prize_pool_sc: newPool,
      platform_fee_sc: newFee,
      updated_at: new Date().toISOString(),
    })
    .eq("id", String(round.id))
    .select("*")
    .single();

  if (uRoundErr || !updatedRound) {
    return NextResponse.json({ message: uRoundErr?.message ?? "Round update failed" }, { status: 500 });
  }

  const { error: pErr } = await supabase
    .from("celo_room_players")
    .update({ entry_sc: bank, bet_cents: bank })
    .eq("room_id", roomId)
    .eq("user_id", userId);

  if (pErr) {
    return NextResponse.json({ message: pErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    round: updatedRound,
    gpayCoins: (await getUserCoins(userId)).gpayCoins,
  });
}
