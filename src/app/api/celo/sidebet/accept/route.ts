import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { deductGPay, creditGPay, getGPayBalance } from "@/lib/gpay-balance";

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
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

  const { bet_id } = body as { bet_id?: string };
  if (!bet_id) {
    return NextResponse.json({ error: "bet_id required" }, { status: 400 });
  }

  // Fetch the side bet
  const { data: betRows } = await supabase
    .from("celo_side_bets")
    .select("*")
    .eq("id", bet_id)
    .limit(1);

  const bet = celoFirstRow(betRows);
  if (!bet) {
    return NextResponse.json({ error: "Side bet not found" }, { status: 404 });
  }

  const b = bet as {
    id: string;
    room_id: string;
    round_id: string;
    creator_id: string;
    amount_cents: number;
    status: string;
    expires_at: string | null;
  };

  if (b.creator_id === userId) {
    return NextResponse.json({ error: "Cannot accept your own side bet" }, { status: 400 });
  }

  if (b.status !== "open") {
    return NextResponse.json(
      { error: "Side bet is no longer open for acceptance" },
      { status: 400 }
    );
  }

  if (b.expires_at && new Date(b.expires_at).getTime() < Date.now()) {
    // Expire the bet and refund creator
    await supabase
      .from("celo_side_bets")
      .update({ status: "expired", settled_at: new Date().toISOString() })
      .eq("id", bet_id);
    await creditGPay(b.creator_id, b.amount_cents, {
      description: "C-Lo side bet refund (expired)",
      reference: `celo_sidebet_expired_${bet_id}`,
    });
    return NextResponse.json({ error: "Side bet has expired" }, { status: 400 });
  }

  // Verify acceptor is in the room
  const { data: playerRows } = await supabase
    .from("celo_room_players")
    .select("role")
    .eq("room_id", b.room_id)
    .eq("user_id", userId)
    .limit(1);

  if (!celoFirstRow(playerRows)) {
    return NextResponse.json({ error: "Not in this room" }, { status: 403 });
  }

  const balanceGpay = await getGPayBalance(userId);
  if (balanceGpay < b.amount_cents) {
    return NextResponse.json({ error: "Insufficient $GPAY balance" }, { status: 400 });
  }

  const deductResult = await deductGPay(userId, b.amount_cents, balanceGpay, {
    description: "C-Lo side bet accept",
    reference: `celo_sidebet_accept_${bet_id}_${Date.now()}`,
  });

  if (!deductResult.ok) {
    return NextResponse.json(
      { error: deductResult.message ?? "Failed to deduct bet amount" },
      { status: 400 }
    );
  }

  // Mark bet as matched
  const { data: updatedBetRows, error: updateErr } = await supabase
    .from("celo_side_bets")
    .update({
      acceptor_id: userId,
      status: "matched",
    })
    .eq("id", bet_id)
    .eq("status", "open") // Optimistic lock — prevent double-accept
    .select()
    .limit(1);

  const updatedBet = celoFirstRow(updatedBetRows);
  if (updateErr || !updatedBet) {
    await creditGPay(userId, b.amount_cents, {
      description: "C-Lo side bet accept refund",
      reference: `celo_sidebet_accept_refund_${bet_id}_${Date.now()}`,
    });
    return NextResponse.json(
      { error: "Side bet was already accepted or is no longer available" },
      { status: 409 }
    );
  }

  await supabase.from("celo_audit_log").insert({
    room_id: b.room_id,
    round_id: b.round_id,
    user_id: userId,
    action: "sidebet_accepted",
    details: { bet_id, amount_cents: b.amount_cents },
  });

  return NextResponse.json({ bet: updatedBet });
}
