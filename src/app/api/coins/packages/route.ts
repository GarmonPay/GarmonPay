import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/coins/packages — active GC packages (public). */
export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ packages: [] }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("gc_packages")
    .select("id, name, price_cents, gold_coins, bonus_sweeps_coins, bonus_label, is_featured")
    .eq("is_active", true)
    .order("price_cents", { ascending: true });

  if (error) {
    console.error("[coins/packages]", error.message);
    return NextResponse.json({ packages: [] }, { status: 200 });
  }

  return NextResponse.json({ packages: data ?? [] });
}
