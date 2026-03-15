import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

const CATEGORIES = [
  "Gloves",
  "Shoes",
  "Shorts",
  "Headgear",
  "Special Upgrades",
  "Titles",
  "Recovery",
  "Training Camp",
  "Arena Coins",
];

/** GET /api/arena/store/items — list store items by category (optional ?category=). */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  let query = supabase
    .from("arena_store_items")
    .select("id, category, name, description, price, coin_price, stat_bonuses, effect_class, emoji")
    .eq("is_active", true);
  if (category && CATEGORIES.includes(category)) {
    query = query.eq("category", category);
  }
  const { data: items, error } = await query.order("category").order("name");
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: items ?? [], categories: CATEGORIES });
}
