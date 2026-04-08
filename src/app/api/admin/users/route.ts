import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/users — list all users from public.users. Requires X-Admin-Id. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ users: [], message: "Set SUPABASE_SERVICE_ROLE_KEY for full user list." });
  }

  const { data: users, error } = await supabase
    .from("users")
    .select("id, email, role, balance, banned, banned_reason, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Admin users query error:", error);
    const message =
      error.message && error.message.includes("balance")
        ? "Missing column: run migration 20250242000000_add_users_balance_column.sql in Supabase SQL Editor (adds balance to public.users)."
        : error.message;
    return NextResponse.json({ message, users: [] }, { status: 500 });
  }

  const userList = users ?? [];
  const ids = userList.map((u) => (u as { id: string }).id).filter(Boolean);

  const wbMap = new Map<string, number>();
  const gpayMap = new Map<string, { available_minor: number; lifetime_earned_minor: number }>();

  if (ids.length > 0) {
    const { data: wbRows } = await supabase.from("wallet_balances").select("user_id, balance").in("user_id", ids);
    for (const row of wbRows ?? []) {
      const uid = (row as { user_id: string }).user_id;
      wbMap.set(uid, Math.round(Number((row as { balance?: number }).balance ?? 0)));
    }
    const { data: gRows } = await supabase
      .from("gpay_balances")
      .select("user_id, available_minor, lifetime_earned_minor")
      .in("user_id", ids);
    for (const row of gRows ?? []) {
      const uid = (row as { user_id: string }).user_id;
      gpayMap.set(uid, {
        available_minor: Math.round(Number((row as { available_minor?: number }).available_minor ?? 0)),
        lifetime_earned_minor: Math.round(Number((row as { lifetime_earned_minor?: number }).lifetime_earned_minor ?? 0)),
      });
    }
  }

  const enriched = userList.map((u) => {
    const row = u as {
      id: string;
      balance?: number | null;
    };
    const id = row.id;
    const fallbackUsd = Math.round(Number(row.balance ?? 0));
    const usd = wbMap.has(id) ? wbMap.get(id)! : fallbackUsd;
    const g = gpayMap.get(id);
    return {
      ...u,
      usd_balance_cents: usd,
      gpay_available_minor: g?.available_minor ?? 0,
      gpay_lifetime_earned_minor: g?.lifetime_earned_minor ?? 0,
    };
  });

  return NextResponse.json({ users: enriched });
}
