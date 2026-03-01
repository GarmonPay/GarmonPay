import { NextResponse } from "next/server";
import { getSupabaseAuthUser } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/wallet/balance — authenticated wallet balance from Supabase. */
export async function GET(request: Request) {
  const authUser = await getSupabaseAuthUser(request);
  if (!authUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const withDeposits = await supabase
    .from("users")
    .select("balance, total_deposits")
    .eq("id", authUser.id)
    .maybeSingle();

  let balance = 0;
  let totalDeposits = 0;

  if (!withDeposits.error && withDeposits.data) {
    const row = withDeposits.data as { balance?: number; total_deposits?: number };
    balance = Number(row.balance ?? 0);
    totalDeposits = Number(row.total_deposits ?? 0);
  } else {
    const fallback = await supabase
      .from("users")
      .select("balance")
      .eq("id", authUser.id)
      .maybeSingle();
    if (fallback.error || !fallback.data) {
      return NextResponse.json({ message: "Wallet not found" }, { status: 404 });
    }
    balance = Number((fallback.data as { balance?: number }).balance ?? 0);
  }

  return NextResponse.json({
    userId: authUser.id,
    balance,
    balanceCents: Math.round(balance),
    totalDeposits,
  });
}
