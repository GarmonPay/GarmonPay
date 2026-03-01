import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/dashboard
 * Returns TOTAL USERS and TOTAL DEPOSITS from Supabase only.
 * Uses service role when available so RLS does not block counts; falls back to anon.
 */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || (!serviceKey && !anonKey)) {
    return NextResponse.json(
      { totalUsers: 0, totalDeposits: 0, message: "Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL and KEY)" },
      { status: 503 }
    );
  }

  const supabase = createClient(url, serviceKey || anonKey!);

  // TOTAL USERS: public.users count (service role bypasses RLS)
  const { count, error: countError } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });
  if (countError) {
    console.error("Admin dashboard users count error:", countError);
    return NextResponse.json(
      { totalUsers: 0, totalDeposits: 0, message: countError.message },
      { status: 500 }
    );
  }
  const totalUsers = count ?? 0;

  // TOTAL DEPOSITS (cents): prefer users.total_deposits; fallback to transactions type=deposit.
  let totalDeposits = 0;
  const userDeposits = await supabase.from("users").select("total_deposits");
  if (!userDeposits.error) {
    totalDeposits = (userDeposits.data ?? []).reduce(
      (sum: number, row: { total_deposits?: number | null }) =>
        sum + Number(row?.total_deposits ?? 0),
      0
    );
  } else {
    const txDeposits = await supabase
      .from("transactions")
      .select("amount")
      .eq("type", "deposit")
      .eq("status", "completed");
    if (txDeposits.error) {
      console.error("Admin dashboard deposits error:", txDeposits.error);
      return NextResponse.json(
        { totalUsers, totalDeposits: 0, message: txDeposits.error.message },
        { status: 500 }
      );
    }
    totalDeposits = (txDeposits.data ?? []).reduce(
      (sum: number, row: { amount?: number | null }) => sum + Number(row?.amount ?? 0),
      0
    );
  }

  return NextResponse.json({ totalUsers, totalDeposits });
}
