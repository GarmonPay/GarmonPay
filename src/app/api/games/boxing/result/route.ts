import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

type ResultBody = {
  winner_id?: string;
  loser_id?: string;
  bet_amount?: number;
};

export async function POST(request: Request) {
  const callerId = await getAuthUserId(request);
  if (!callerId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: ResultBody;
  try {
    body = (await request.json()) as ResultBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const winnerId = typeof body.winner_id === "string" ? body.winner_id.trim() : "";
  const loserId = typeof body.loser_id === "string" ? body.loser_id.trim() : "";
  const rawBetAmount = typeof body.bet_amount === "number" ? body.bet_amount : NaN;

  if (!winnerId || !loserId || !Number.isFinite(rawBetAmount)) {
    return NextResponse.json(
      { message: "winner_id, loser_id and bet_amount are required" },
      { status: 400 }
    );
  }
  if (winnerId === loserId) {
    return NextResponse.json({ message: "winner_id and loser_id must be different" }, { status: 400 });
  }
  if (callerId !== winnerId && callerId !== loserId) {
    return NextResponse.json(
      { message: "Only a match participant can report result" },
      { status: 403 }
    );
  }

  const betAmount = Math.max(1, Math.round(rawBetAmount));
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { message: "Wallet update unavailable: Supabase admin client not configured" },
      { status: 500 }
    );
  }

  const { data: users, error: usersError } = await admin
    .from("users")
    .select("id, balance")
    .in("id", [winnerId, loserId]);
  if (usersError) {
    return NextResponse.json({ message: usersError.message }, { status: 500 });
  }

  const winner = (users ?? []).find((user) => user.id === winnerId);
  const loser = (users ?? []).find((user) => user.id === loserId);
  if (!winner || !loser) {
    return NextResponse.json({ message: "Winner or loser does not exist" }, { status: 404 });
  }

  const winnerBalance = Number(winner.balance ?? 0);
  const loserBalance = Number(loser.balance ?? 0);
  if (loserBalance < betAmount) {
    return NextResponse.json({ message: "Loser has insufficient balance for transfer" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const referenceId = `boxing-result-${winnerId.slice(0, 8)}-${loserId.slice(0, 8)}-${Date.now()}`;

  const { error: loserUpdateError } = await admin
    .from("users")
    .update({
      balance: loserBalance - betAmount,
      updated_at: now,
    })
    .eq("id", loserId);
  if (loserUpdateError) {
    return NextResponse.json({ message: loserUpdateError.message }, { status: 500 });
  }

  const { error: winnerUpdateError } = await admin
    .from("users")
    .update({
      balance: winnerBalance + betAmount,
      updated_at: now,
    })
    .eq("id", winnerId);
  if (winnerUpdateError) {
    await admin
      .from("users")
      .update({ balance: loserBalance, updated_at: now })
      .eq("id", loserId);
    return NextResponse.json({ message: winnerUpdateError.message }, { status: 500 });
  }

  await admin.from("transactions").insert([
    {
      user_id: winnerId,
      type: "boxing_prize",
      amount: betAmount,
      status: "completed",
      description: "Boxing game winner payout",
      reference_id: referenceId,
    },
    {
      user_id: loserId,
      type: "boxing_bet",
      amount: betAmount,
      status: "completed",
      description: "Boxing game match loss",
      reference_id: referenceId,
    },
  ]);

  return NextResponse.json({
    success: true,
    winner_id: winnerId,
    loser_id: loserId,
    bet_amount: betAmount,
  });
}
