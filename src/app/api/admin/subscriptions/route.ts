import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/admin/subscriptions — create a subscription (for testing / backoffice). */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: { userId: string; membershipTier: string; monthlyPriceCents: number; nextBillingDate?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const { userId, membershipTier, monthlyPriceCents } = body;
  if (!userId || !["starter", "pro", "elite", "vip"].includes(membershipTier) || typeof monthlyPriceCents !== "number" || monthlyPriceCents < 0) {
    return NextResponse.json({ message: "userId, membershipTier (starter|pro|elite|vip), monthlyPriceCents required" }, { status: 400 });
  }
  const nextBilling = body.nextBillingDate
    ? new Date(body.nextBillingDate)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();
  const nextBillingDate = nextBilling.toISOString().slice(0, 10);
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .insert({
        user_id: userId,
        membership_tier: membershipTier,
        monthly_price: monthlyPriceCents,
        status: "active",
        started_at: new Date().toISOString(),
        next_billing_date: nextBillingDate,
        updated_at: new Date().toISOString(),
      })
      .select("id, user_id, membership_tier, monthly_price, status, next_billing_date")
      .single();
    if (error) throw error;
    return NextResponse.json({ subscription: data });
  } catch (e) {
    return NextResponse.json({ message: "Failed to create subscription" }, { status: 500 });
  }
}
