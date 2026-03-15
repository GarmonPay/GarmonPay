import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getSeasonPassActive, seasonPassStoreMultiplier } from "@/lib/arena-season-pass";

/** POST /api/arena/store/buy — purchase with arena coins. Deducts coins, adds to inventory; titles/recovery/training_camp/coins handled by effect_class. */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { storeItemId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const storeItemId = body.storeItemId;
  if (!storeItemId || typeof storeItemId !== "string") {
    return NextResponse.json({ message: "storeItemId required" }, { status: 400 });
  }

  const { data: item, error: itemErr } = await supabase
    .from("arena_store_items")
    .select("id, category, name, coin_price, effect_class")
    .eq("id", storeItemId)
    .eq("is_active", true)
    .maybeSingle();
  if (itemErr || !item) {
    return NextResponse.json({ message: "Item not found" }, { status: 404 });
  }
  const coinPrice = Number((item as { coin_price?: number }).coin_price ?? 0);
  if (!(coinPrice > 0)) {
    return NextResponse.json({ message: "Item is not available for coins" }, { status: 400 });
  }
  const seasonPassActive = await getSeasonPassActive(userId);
  const effectivePrice = Math.max(1, Math.floor(coinPrice * seasonPassStoreMultiplier(seasonPassActive)));

  const { data: fighter, error: fErr } = await supabase
    .from("arena_fighters")
    .select("id, condition, title")
    .eq("user_id", userId)
    .maybeSingle();
  if (fErr || !fighter) {
    return NextResponse.json({ message: "Fighter not found" }, { status: 404 });
  }

  const { data: userRow, error: uErr } = await supabase
    .from("users")
    .select("arena_coins")
    .eq("id", userId)
    .single();
  if (uErr || !userRow) {
    return NextResponse.json({ message: "User not found" }, { status: 500 });
  }
  const currentCoins = Number((userRow as { arena_coins?: number }).arena_coins ?? 0);
  if (currentCoins < effectivePrice) {
    return NextResponse.json({ message: "Insufficient arena coins", required: effectivePrice }, { status: 400 });
  }

  const effectClass = (item as { effect_class?: string }).effect_class;
  if (effectClass === "recovery") {
    const { error: upErr } = await supabase
      .from("arena_fighters")
      .update({ condition: "fresh", updated_at: new Date().toISOString() })
      .eq("id", fighter.id);
    if (upErr) return NextResponse.json({ message: "Failed to apply recovery" }, { status: 500 });
  } else if (effectClass === "title") {
    const titleName = (item as { name?: string }).name ?? "Title";
    const { error: upErr } = await supabase
      .from("arena_fighters")
      .update({ title: titleName, updated_at: new Date().toISOString() })
      .eq("id", fighter.id);
    if (upErr) return NextResponse.json({ message: "Failed to set title" }, { status: 500 });
  } else if (effectClass === "coins") {
    return NextResponse.json({ message: "Arena Coins packs are purchased with real money only" }, { status: 400 });
  } else {
    const { error: invErr } = await supabase.from("arena_fighter_inventory").insert({
      fighter_id: fighter.id,
      store_item_id: storeItemId,
    });
    if (invErr) return NextResponse.json({ message: invErr.message ?? "Failed to add to inventory" }, { status: 500 });
  }

  const newCoins = currentCoins - effectivePrice;
  await supabase.from("users").update({ arena_coins: newCoins }).eq("id", userId);
  await supabase.from("arena_coin_transactions").insert({
    user_id: userId,
    amount: -effectivePrice,
    type: "store_purchase",
    description: `Purchased: ${(item as { name?: string }).name}${seasonPassActive ? " (10% Season Pass discount)" : ""}`,
  });
  await supabase.from("arena_admin_earnings").insert({
    source_type: "store",
    source_id: fighter.id,
    amount: 0,
  });

  return NextResponse.json({ success: true, arenaCoins: newCoins });
}
