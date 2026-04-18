import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { bonusGpayFromGcPackageRow } from "@/lib/gold-coin-packages";

/** GET /api/coins/packages — active GC packages (public). */
export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("gc_packages")
    .select("*")
    .eq("is_active", true)
    .order("price_cents", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const packages = rows.map((row) => ({
    ...row,
    bonus_gpay_coins: bonusGpayFromGcPackageRow(row),
  }));

  return NextResponse.json({ packages });
}
