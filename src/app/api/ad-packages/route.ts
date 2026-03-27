import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/** Always fresh — no stale JSON after deploy or DB edits */
export const dynamic = "force-dynamic";

/**
 * GET /api/ad-packages — public list of active ad packages (Supabase `ad_packages`).
 */
export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("ad_packages")
    .select("id, name, price_monthly, ad_views, included_clicks, sort_order, features, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("price_monthly", { ascending: true });

  if (error) {
    console.error("[api/ad-packages]", error);
    return NextResponse.json({ message: "Failed to load packages" }, { status: 500 });
  }

  const rows = (data ?? []) as { id: string }[];
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (!r?.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return NextResponse.json({ packages: unique });
}
