import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

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
    .select("id, name, price_monthly, ad_views, features, is_active")
    .eq("is_active", true)
    .order("price_monthly", { ascending: true });

  if (error) {
    console.error("[api/ad-packages]", error);
    return NextResponse.json({ message: "Failed to load packages" }, { status: 500 });
  }

  return NextResponse.json({ packages: data ?? [] });
}
