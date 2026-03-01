import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin-auth";

function normalizeAmountToCents(value: number | null | undefined): number {
  const raw = Number(value ?? 0);
  if (!Number.isFinite(raw)) return 0;
  // Legacy rows may have dollars in decimal; current platform uses cents.
  return Number.isInteger(raw) ? raw : Math.round(raw * 100);
}

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

  // TOTAL DEPOSITS: public.deposits sum of amount
  const { data: depositsData, error: depositsError } = await supabase
    .from("deposits")
    .select("amount");
  if (depositsError) {
    console.error("Admin dashboard deposits error:", depositsError);
    return NextResponse.json(
      { totalUsers, totalDeposits: 0, message: depositsError.message },
      { status: 500 }
    );
  }
  const totalDeposits = (depositsData ?? []).reduce(
    (sum: number, row: { amount?: number | null }) =>
      sum + normalizeAmountToCents(row?.amount),
    0
  );

  return NextResponse.json({ totalUsers, totalDeposits });
}
