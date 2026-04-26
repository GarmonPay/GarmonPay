import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { debitGpayCoins, creditGpayIdempotent } from "@/lib/coins";
import { celoAccountingAuditLog, celoAccountingLog } from "@/lib/celo-accounting";
import { CELO_SIDEBET_ODDS } from "@/lib/celo-sidebet-odds";
import { randomUUID } from "crypto";

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
  let body: {
    room_id?: string;
    round_id?: string;
    bet_type?: string;
    amount_sc?: number;
    idempotency_key?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "");
  const roundIdRaw = body.round_id
    ? String(body.round_id).trim()
    : "";
  const betType = String(body.bet_type ?? "");
  const amount = Math.floor(Number(body.amount_sc ?? 0));
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  if (amount < 100 || amount % 100 !== 0) {
    return NextResponse.json(
      { error: "Amount must be at least 100 GPC in multiples of 100" },
      { status: 400 }
    );
  }
  const mult = CELO_SIDEBET_ODDS[betType];
  if (mult == null) {
    return NextResponse.json({ error: "Invalid bet_type" }, { status: 400 });
  }
  const { data: inRoom } = await adminClient
    .from("celo_room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!inRoom) {
    return NextResponse.json(
      { error: "You must be in the room" },
      { status: 400 }
    );
  }
  if (roundIdRaw) {
    const { data: rd } = await adminClient
      .from("celo_rounds")
      .select("id, status")
      .eq("id", roundIdRaw)
      .maybeSingle();
    if (!rd) {
      return NextResponse.json({ error: "Round not found" }, { status: 400 });
    }
    if (String((rd as { status: string }).status) === "completed") {
      return NextResponse.json(
        { error: "This round is already over" },
        { status: 400 }
      );
    }
  }
  const idem = String(body.idempotency_key ?? "").trim();
  const ref = idem.length
    ? `celo_side_create_${idem}`
    : `celo_side_create_${roomId}_${roundIdRaw || "na"}_${userId}_${randomUUID()}`;
  const debit = await debitGpayCoins(
    userId,
    amount,
    "C-Lo side entry (post)",
    ref,
    "celo_sidebet"
  );
  if (!debit.success) {
    return NextResponse.json(
      { error: debit.message ?? "Insufficient balance" },
      { status: 400 }
    );
  }
  const expires = new Date(Date.now() + 60_000).toISOString();
  const { data: sideBet, error } = await adminClient
    .from("celo_side_bets")
    .insert({
      room_id: roomId,
      round_id: roundIdRaw || null,
      creator_id: userId,
      bet_type: betType,
      amount_cents: amount,
      odds_multiplier: mult,
      status: "open",
      expires_at: expires,
      creator_debit_ref: ref,
    })
    .select("*")
    .single();
  if (error) {
    const refundRef = `celo_side_create_refund_${ref}`;
    celoAccountingLog("side_create_refund_attempt", {
      roomId,
      userId,
      amount,
      reference: refundRef,
    });
    celoAccountingAuditLog("sidebet_create_refund_after_insert_failed", {
      roomId,
      userId,
      reference: refundRef,
    });
    await creditGpayIdempotent(
      userId,
      amount,
      "C-Lo side entry refund (insert failed)",
      refundRef,
      "celo_bank_refund"
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sideBet });
}
