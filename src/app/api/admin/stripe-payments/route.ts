import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/stripe-payments — list recent Stripe payments for admin dashboard.
 */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ payments: [], message: "Supabase not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("stripe_payments")
    .select("id, user_id, email, amount, currency, status, stripe_session_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[admin stripe-payments]", error);
    return NextResponse.json({ payments: [] });
  }

  return NextResponse.json({
    payments: (data ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      email: r.email,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      stripe_session_id: r.stripe_session_id,
      created_at: r.created_at,
    })),
  });
}
