import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/coins/history — recent coin_transactions for current user */
export async function GET(request: Request) {
  const userId = await getAuthUserIdBearerOrCookie(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ entries: [] }, { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "30", 10) || 30));

  const { data, error } = await supabase
    .from("coin_transactions")
    .select("id, type, gold_coins, gpay_coins, description, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[coins/history]", error.message);
    return NextResponse.json({ entries: [] }, { status: 200 });
  }

  return NextResponse.json({ entries: data ?? [] });
}
