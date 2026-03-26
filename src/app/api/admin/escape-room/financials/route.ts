import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { getEscapeSettings, netPoolCents, sumStakePoolForWindow, utcDateWindow } from "@/lib/escape-room-db";

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const d0 = searchParams.get("date_from") ?? utcDateWindow();
  const d1 = searchParams.get("date_to") ?? d0;

  const settings = await getEscapeSettings();
  const feePct = settings ? Number(settings.platform_fee_percent) : 15;

  let totalGross = 0;
  let t = new Date(d0 + "T00:00:00Z");
  const end = new Date(d1 + "T00:00:00Z");
  while (t <= end) {
    const key = t.toISOString().slice(0, 10);
    totalGross += await sumStakePoolForWindow(key);
    t = new Date(t.getTime() + 86400000);
  }
  const totalFee = Math.max(0, totalGross - netPoolCents(totalGross, feePct));

  const { data: pending } = await supabase
    .from("escape_room_payouts")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: history } = await supabase
    .from("escape_room_payouts")
    .select("*")
    .in("status", ["paid", "failed", "rejected", "voided"])
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: failedLedger } = await supabase
    .from("escape_room_sessions")
    .select("id, player_id, payout_cents, updated_at")
    .eq("payout_status", "failed")
    .order("updated_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    date_from: d0,
    date_to: d1,
    stake_gross_cents_in_range: totalGross,
    platform_fee_cents_in_range: totalFee,
    pending_payouts: pending ?? [],
    payout_history: history ?? [],
    failed_wallet_sessions: failedLedger ?? [],
  });
}
