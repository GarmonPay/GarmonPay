import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { getUserCoins } from "@/lib/coins";
import { debitGpayCoins } from "@/lib/coins";
import { validateEntry } from "@/lib/celo-engine";

const MAX = [2, 4, 6, 10] as const;

export async function POST(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const auth = await getCeloAuth(request, clients);
  if (!auth) {
    return celoUnauthorizedJsonResponse();
  }
  const { user, adminClient } = auth;
  const userId = user.id;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const maxPlayers = Number(body.max_players);
  const minimumEntry = Math.floor(Number(body.minimum_entry_sc));
  const startingBank = Math.floor(Number(body.starting_bank_sc));
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!MAX.includes(maxPlayers as (typeof MAX)[number])) {
    return NextResponse.json(
      { error: "max_players must be 2, 4, 6, or 10" },
      { status: 400 }
    );
  }
  if (minimumEntry < 500) {
    return NextResponse.json(
      { error: "minimum_entry_sc must be at least 500" },
      { status: 400 }
    );
  }
  if (startingBank < minimumEntry) {
    return NextResponse.json(
      { error: "starting_bank_sc must be at least minimum_entry_sc" },
      { status: 400 }
    );
  }
  if (startingBank % minimumEntry !== 0) {
    return NextResponse.json(
      { error: "starting_bank_sc must be a multiple of minimum_entry_sc" },
      { status: 400 }
    );
  }
  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < startingBank) {
    return NextResponse.json(
      { error: "Insufficient GPay Coins for starting bank" },
      { status: 400 }
    );
  }
  const debitRef = `celo_room_create_${userId}_${Date.now()}`;
  const debit = await debitGpayCoins(
    userId,
    startingBank,
    "C-Lo create table (starting bank)",
    debitRef,
    "celo_entry"
  );
  if (!debit.success) {
    return NextResponse.json(
      { error: debit.message ?? "Debit failed" },
      { status: 400 }
    );
  }
  const v = validateEntry(startingBank, minimumEntry);
  if (!v.valid) {
    await creditPartialRefund(
      userId,
      startingBank,
      `revert: invalid entry multiple — ${v.error}`
    );
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const now = new Date().toISOString();
  const { data: room, error: insErr } = await adminClient
    .from("celo_rooms")
    .insert({
      name,
      creator_id: userId,
      banker_id: userId,
      status: "waiting",
      room_type: "public",
      max_players: maxPlayers,
      min_bet_cents: minimumEntry,
      max_bet_cents: Math.max(10_000, startingBank * 4),
      minimum_entry_sc: minimumEntry,
      current_bank_sc: startingBank,
      last_round_was_celo: false,
      total_rounds: 0,
      platform_fee_pct: 10,
      last_activity: now,
    })
    .select("*")
    .single();
  if (insErr || !room) {
    await creditPartialRefund(
      userId,
      startingBank,
      "revert: room insert failed"
    );
    return NextResponse.json(
      { error: insErr?.message ?? "Could not create room" },
      { status: 500 }
    );
  }
  const roomId = (room as { id: string }).id;
  const { error: pErr } = await adminClient.from("celo_room_players").insert({
    room_id: roomId,
    user_id: userId,
    role: "banker",
    seat_number: 0,
    entry_sc: 0,
    bet_cents: 0,
    dice_type: "standard",
  });
  if (pErr) {
    await adminClient.from("celo_rooms").delete().eq("id", roomId);
    await creditPartialRefund(
      userId,
      startingBank,
      "revert: could not add banker to table"
    );
    return NextResponse.json(
      { error: pErr.message ?? "Could not create room" },
      { status: 500 }
    );
  }
  return NextResponse.json({ room });
}

/** Best-effort refund of starting bank on failure. */
async function creditPartialRefund(
  userId: string,
  amount: number,
  _reason: string
) {
  const { creditCoins } = await import("@/lib/coins");
  await creditCoins(
    userId,
    0,
    amount,
    "C-Lo create table refund (failed create)",
    `celo_create_refund_${userId}_${Date.now()}`,
    "celo_bank_refund"
  );
}
