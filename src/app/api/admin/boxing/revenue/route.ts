import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/boxing/revenue — 10% of all bets as boxing revenue. Admin only. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase.from("bets").select("amount");

  if (error) {
    return NextResponse.json({ revenue: 0 });
  }

  let revenue = 0;
  (data ?? []).forEach((b) => {
    revenue += Number((b as { amount?: number }).amount ?? 0) * 0.1;
  });

  return NextResponse.json({ revenue });
}
