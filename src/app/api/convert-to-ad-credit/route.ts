import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { convertBalanceToAdCredit } from "@/lib/transactions-db";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/convert-to-ad-credit — move amount from balance to ad_credit_balance. Server-side only. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: { amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const amountCents = typeof body.amount === "number" ? Math.round(body.amount) : null;
  if (amountCents == null || amountCents <= 0) {
    return NextResponse.json({ message: "Invalid amount" }, { status: 400 });
  }

  const result = await convertBalanceToAdCredit(userId, amountCents);
  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  return NextResponse.json({
    success: true,
    amountCents: result.amountCents,
    message: "Balance converted to ad credit",
  });
}
