import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import {
  submitWithdrawal,
  listWithdrawalsByUser,
  MIN_WITHDRAWAL_CENTS,
  type WithdrawalMethod,
} from "@/lib/withdrawals-db";
import { recordActivity } from "@/lib/viral-db";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/withdrawals — list current user's withdrawals. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ withdrawals: [], minWithdrawalCents: MIN_WITHDRAWAL_CENTS });
  }
  try {
    const list = await listWithdrawalsByUser(userId);
    return NextResponse.json({
      withdrawals: list,
      minWithdrawalCents: MIN_WITHDRAWAL_CENTS,
    });
  } catch (e) {
    console.error("List withdrawals error:", e);
    return NextResponse.json({ withdrawals: [], minWithdrawalCents: MIN_WITHDRAWAL_CENTS });
  }
}

/** POST /api/withdrawals — submit withdrawal (deducts balance, creates pending). */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: { amount?: number; method?: string; wallet_address?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const amountCents = typeof body.amount === "number" ? Math.round(body.amount) : null;
  const method = ["crypto", "paypal", "bank"].includes(body.method ?? "")
    ? (body.method as WithdrawalMethod)
    : null;
  const walletAddress = typeof body.wallet_address === "string" ? body.wallet_address : "";

  if (amountCents == null || amountCents < MIN_WITHDRAWAL_CENTS) {
    return NextResponse.json(
      { message: `Minimum withdrawal is $${(MIN_WITHDRAWAL_CENTS / 100).toFixed(2)}` },
      { status: 400 }
    );
  }
  if (!method) {
    return NextResponse.json({ message: "Invalid method" }, { status: 400 });
  }
  if (!walletAddress.trim()) {
    return NextResponse.json({ message: "Wallet address required" }, { status: 400 });
  }

  const result = await submitWithdrawal(userId, amountCents, method, walletAddress);
  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  recordActivity(userId, "withdrew", "Withdrawal requested", amountCents).catch(() => {});
  return NextResponse.json({
    withdrawal: result.withdrawal,
    message: "Withdrawal submitted for approval",
  });
}
