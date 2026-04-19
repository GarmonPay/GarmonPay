import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import {
  requestWithdrawal,
  listWithdrawalsByUser,
  MIN_WITHDRAWAL_CENTS,
  normalizeWithdrawalMethod,
} from "@/lib/withdrawals-db";
import { recordActivity } from "@/lib/viral-db";
import { createAdminClient } from "@/lib/supabase";
import { sanitizeWalletAddress } from "@/lib/security";
import { normalizeUserMembershipTier } from "@/lib/garmon-plan-config";

const MIN_BY_PLAN_CENTS: Record<string, number> = {
  free: 2000,
  starter: 1000,
  growth: 500,
  pro: 200,
  elite: 100,
};

/** GET /api/withdrawals — list current user's withdrawals. */
export async function GET(request: Request) {
  const userId = await getAuthUserIdStrict(request);
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
  const userId = await getAuthUserIdStrict(request);
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
  const method = normalizeWithdrawalMethod(body.method);
  const walletAddress = sanitizeWalletAddress(body.wallet_address);

  const admin = createAdminClient();
  const { data: userRow } = await admin!
    .from("users")
    .select("membership")
    .eq("id", userId)
    .maybeSingle();
  const plan = normalizeUserMembershipTier((userRow as { membership?: string } | null)?.membership);
  const planMin = MIN_BY_PLAN_CENTS[plan] ?? MIN_WITHDRAWAL_CENTS;

  if (amountCents == null || amountCents < planMin) {
    return NextResponse.json(
      { message: `Minimum withdrawal is $${(planMin / 100).toFixed(2)} for ${plan} plan` },
      { status: 400 }
    );
  }
  if (!method) {
    return NextResponse.json({ message: "Invalid method" }, { status: 400 });
  }
  if (!walletAddress.trim()) {
    return NextResponse.json({ message: "Wallet address required" }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const result = await requestWithdrawal(userId, amountCents, method, walletAddress, ip);
  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  await admin!.from("withdrawal_requests").insert({
    user_id: userId,
    amount_cents: amountCents,
    status: "pending",
    stripe_email: walletAddress,
  }).then(({ error }) => {
    if (error) console.warn("[withdrawals] withdrawal_requests insert failed:", error.message);
  });
  recordActivity(userId, "withdrew", "Withdrawal requested", amountCents).catch(() => {});
  return NextResponse.json({
    withdrawal: result.withdrawal,
    message: "Withdrawal submitted for approval",
  });
}
