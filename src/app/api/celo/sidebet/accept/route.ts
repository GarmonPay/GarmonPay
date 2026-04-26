import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { debitGpayCoins, creditGpayIdempotent } from "@/lib/coins";
import { celoAccountingAuditLog, celoAccountingLog } from "@/lib/celo-accounting";

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
  let body: { bet_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const betId = String(body.bet_id ?? "");
  if (!betId) {
    return NextResponse.json({ error: "bet_id required" }, { status: 400 });
  }
  const { data: betRaw, error: bErr } = await adminClient
    .from("celo_side_bets")
    .select("*")
    .eq("id", betId)
    .maybeSingle();
  if (bErr || !betRaw) {
    return NextResponse.json({ error: "Side entry not found" }, { status: 404 });
  }
  const bet = betRaw as {
    id: string;
    creator_id: string;
    status: string;
    amount_cents: number;
    expires_at: string | null;
    acceptor_id: string | null;
  };
  if (bet.creator_id === userId) {
    return NextResponse.json(
      { error: "You cannot match your own post" },
      { status: 400 }
    );
  }
  if (bet.status === "matched" && bet.acceptor_id === userId) {
    const { data: cur } = await adminClient
      .from("celo_side_bets")
      .select("*")
      .eq("id", betId)
      .single();
    return NextResponse.json({ sideBet: cur, idempotent: true });
  }
  if (bet.status !== "open") {
    return NextResponse.json(
      { error: "This post is not open" },
      { status: 400 }
    );
  }
  if (bet.expires_at && new Date(bet.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This post has expired" },
      { status: 400 }
    );
  }
  const amount = Math.max(0, bet.amount_cents);
  const ref = `celo_side_accept_${betId}_${userId}`;
  const debit = await debitGpayCoins(
    userId,
    amount,
    "C-Lo side entry (match)",
    ref,
    "celo_sidebet"
  );
  if (!debit.success) {
    if (
      typeof debit.message === "string" &&
      /duplicate/i.test(debit.message)
    ) {
      const { data: cur } = await adminClient
        .from("celo_side_bets")
        .select("*")
        .eq("id", betId)
        .maybeSingle();
      if (cur && String((cur as { status?: string }).status) === "matched") {
        return NextResponse.json({ sideBet: cur, idempotent: true });
      }
    }
    return NextResponse.json(
      { error: debit.message ?? "Insufficient balance" },
      { status: 400 }
    );
  }
  const { data: updated, error: uErr } = await adminClient
    .from("celo_side_bets")
    .update({ acceptor_id: userId, status: "matched", acceptor_debit_ref: ref })
    .eq("id", betId)
    .eq("status", "open")
    .select("*")
    .maybeSingle();
  if (uErr) {
    const refundRef = `celo_side_accept_refund_${betId}_${userId}`;
    celoAccountingLog("side_accept_refund_attempt", {
      betId,
      userId,
      amount,
      reference: refundRef,
    });
    celoAccountingAuditLog("sidebet_accept_refund_after_update_failed", {
      betId,
      userId,
      reference: refundRef,
    });
    await creditGpayIdempotent(
      userId,
      amount,
      "C-Lo side entry refund (match update failed)",
      refundRef,
      "celo_bank_refund"
    );
    return NextResponse.json(
      { error: uErr.message },
      { status: 500 }
    );
  }
  if (!updated) {
    const refundRef = `celo_side_accept_refund_${betId}_${userId}_race`;
    await creditGpayIdempotent(
      userId,
      amount,
      "C-Lo side entry refund (match race)",
      refundRef,
      "celo_bank_refund"
    );
    const { data: cur } = await adminClient
      .from("celo_side_bets")
      .select("*")
      .eq("id", betId)
      .maybeSingle();
    if (
      cur &&
      String((cur as { status?: string }).status) === "matched" &&
      (cur as { acceptor_id?: string }).acceptor_id === userId
    ) {
      return NextResponse.json({ sideBet: cur, idempotent: true });
    }
    return NextResponse.json(
      { error: "Could not match this post (race). Try again." },
      { status: 409 }
    );
  }
  return NextResponse.json({ sideBet: updated });
}
