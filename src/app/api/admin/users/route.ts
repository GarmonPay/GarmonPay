import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/users — list users from public.users (service role). Optional ?debug=1 adds raw_balance_cents. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const debug = new URL(request.url).searchParams.get("debug") === "1";

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ users: [], message: "Set SUPABASE_SERVICE_ROLE_KEY for full user list." });
  }

  const { data: users, error } = await supabase
    .from("users")
    .select(
      "id, email, role, balance, balance_cents, referral_code, referred_by, banned, banned_reason, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Admin users query error:", error);
    const message =
      error.message && error.message.includes("balance")
        ? "Users query failed — verify public.users columns (balance_cents, referral_code, referred_by) exist in Supabase."
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
      balance_cents?: number | null;
      referral_code?: string | null;
      referred_by?: string | null;
    };
    const id = row.id;
    const fallbackUsd = Math.round(Number(row.balance ?? 0));
    const usd = wbMap.has(id) ? wbMap.get(id)! : fallbackUsd;
    const g = gpayMap.get(id);
    const rawFromUsers =
      row.balance_cents != null && Number.isFinite(Number(row.balance_cents))
        ? Math.round(Number(row.balance_cents))
        : fallbackUsd;

    const base = {
      ...u,
      usd_balance_cents: usd,
      gpay_available_minor: g?.available_minor ?? 0,
      gpay_lifetime_earned_minor: g?.lifetime_earned_minor ?? 0,
    };

    if (debug) {
      return {
        ...base,
        raw_balance_cents: rawFromUsers,
      };
    }
    return base;
  });

  return NextResponse.json({ users: enriched });
}
