import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: rows, error } = await supabase
    .from("membership_bonuses")
    .select("id, bonus_type, from_tier, to_tier, gpc_amount, credited_at, user_id")
    .order("credited_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  let gpcToday = 0;
  let gpcThisMonth = 0;
  const byTierType: Record<string, number> = {};

  for (const r of list) {
    const row = r as { gpc_amount?: number; credited_at?: string; bonus_type?: string; to_tier?: string };
    const amt = Math.floor(Number(row.gpc_amount ?? 0));
    const ca = row.credited_at ? new Date(row.credited_at) : null;
    if (!ca) continue;
    if (ca >= startOfToday) gpcToday += amt;
    if (ca >= startOfMonth) gpcThisMonth += amt;
    const key = `${row.bonus_type ?? "?"}:${row.to_tier ?? "?"}`;
    byTierType[key] = (byTierType[key] ?? 0) + amt;
  }

  return NextResponse.json({
    totals: {
      gpcToday,
      gpcThisMonth,
    },
    breakdownByTypeTier: byTierType,
    recent: list.slice(0, 100),
  });
}
