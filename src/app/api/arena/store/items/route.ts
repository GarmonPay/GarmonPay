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

const DEFAULT_STORE_ITEMS = [
  { name: "Gold Gloves", description: "Increases punch power by 5%", category: "Gloves", price: null, coin_price: 500, stat_bonuses: { strength: 3 }, effect_class: "rare", emoji: "🥊", is_active: true },
  { name: "Speed Wraps", description: "Faster jabs and counters", category: "Gloves", price: null, coin_price: 350, stat_bonuses: { speed: 3 }, effect_class: "uncommon", emoji: "⚡", is_active: true },
  { name: "Iron Boots", description: "Solid footwork and stability", category: "Shoes", price: null, coin_price: 400, stat_bonuses: { defense: 3 }, effect_class: "uncommon", emoji: "👟", is_active: true },
  { name: "Champion Belt", description: "The mark of a true champion", category: "Special Upgrades", price: null, coin_price: 1000, stat_bonuses: {}, effect_class: "legendary", emoji: "🏆", is_active: true },
  { name: "Protein Pack", description: "+10% training gains for 24h", category: "Recovery", price: null, coin_price: 150, stat_bonuses: { strength: 1 }, effect_class: "common", emoji: "💪", is_active: true },
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

  // Seed default items if table is empty
  const { count } = await supabase.from("arena_store_items").select("id", { count: "exact", head: true });
  if (count === 0) {
    await supabase.from("arena_store_items").insert(DEFAULT_STORE_ITEMS);
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
