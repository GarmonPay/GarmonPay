import { NextResponse } from "next/server";
import { getCeloApiClients } from "@/lib/celo-api-clients";
import { debitGpayCoins } from "@/lib/coins";

export async function POST(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const { sessionClient, adminClient } = clients;
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
  };
  if (bet.creator_id === userId) {
    return NextResponse.json(
      { error: "You cannot match your own post" },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: debit.message ?? "Insufficient balance" },
      { status: 400 }
    );
  }
  const { data: updated, error: uErr } = await adminClient
    .from("celo_side_bets")
    .update({ acceptor_id: userId, status: "matched" })
    .eq("id", betId)
    .select("*")
    .single();
  if (uErr) {
    return NextResponse.json(
      { error: uErr.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ sideBet: updated });
}
