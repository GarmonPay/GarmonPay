import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

type AdminUserRow = {
  id: string;
  email: string | null;
  balance: number | null;
  total_deposits?: number | null;
  created_at: string | null;
};

/** GET /api/admin/users — list users with wallet metrics. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let users: AdminUserRow[] = [];
  const withDeposits = await supabase
    .from("users")
    .select("id, email, balance, total_deposits, created_at")
    .order("created_at", { ascending: false });

  if (withDeposits.error) {
    // Backward-compatible fallback for environments missing users.total_deposits.
    const fallback = await supabase
      .from("users")
      .select("id, email, balance, created_at")
      .order("created_at", { ascending: false });
    if (fallback.error) {
      console.error("Admin users query error:", fallback.error);
      return NextResponse.json({ message: fallback.error.message, users: [] }, { status: 500 });
    }
    users = ((fallback.data ?? []) as AdminUserRow[]).map((u) => ({ ...u, total_deposits: 0 }));
  } else {
    users = (withDeposits.data ?? []) as AdminUserRow[];
  }

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      balance: Number(u.balance ?? 0),
      total_deposits: Number(u.total_deposits ?? 0),
      created_at: u.created_at,
    })),
  });
}
