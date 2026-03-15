import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/arena/jackpot — current week jackpot total (read-only). */
export async function GET(req: Request) {
  await getAuthUserId(req);
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const now = new Date();
  const day = now.getUTCDay();
  const diff = day >= 5 ? day - 5 : day + 2;
  const friday = new Date(now);
  friday.setUTCDate(now.getUTCDate() - diff);
  friday.setUTCHours(0, 0, 0, 0);
  const weekStart = friday.toISOString().slice(0, 10);

  const { data: row } = await supabase
    .from("arena_jackpot")
    .select("id, week_start, total_amount, paid_out")
    .eq("week_start", weekStart)
    .maybeSingle();

  return NextResponse.json({
    weekStart,
    totalAmount: Number((row as { total_amount?: number })?.total_amount ?? 0),
    paidOut: !!(row as { paid_out?: boolean })?.paid_out,
  });
}
