import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/arena/store/inventory — my fighter's owned and equipped items. */
export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const [{ data: fighter, error: fErr }, { data: userRow }] = await Promise.all([
    supabase.from("arena_fighters").select("id, equipped_gloves, equipped_shoes, equipped_shorts, equipped_headgear").eq("user_id", userId).maybeSingle(),
    supabase.from("users").select("arena_coins").eq("id", userId).single(),
  ]);
  if (fErr || !fighter) {
    return NextResponse.json({ message: "Fighter not found" }, { status: 404 });
  }
  const arenaCoins = userRow != null ? Number((userRow as { arena_coins?: number }).arena_coins ?? 0) : 0;
  const { data: inv, error: iErr } = await supabase
    .from("arena_fighter_inventory")
    .select("id, store_item_id, purchased_at")
    .eq("fighter_id", fighter.id);
  if (iErr) {
    return NextResponse.json({ message: iErr.message }, { status: 500 });
  }
  const itemIds = Array.from(new Set((inv ?? []).map((r) => (r as { store_item_id: string }).store_item_id)));
  const f = fighter as { id?: string; equipped_gloves?: string | null; equipped_shoes?: string | null; equipped_shorts?: string | null; equipped_headgear?: string | null } | null;
  if (itemIds.length === 0) {
    return NextResponse.json({
      fighterId: f?.id,
      arenaCoins,
      equipped: {
        gloves: f?.equipped_gloves ?? undefined,
        shoes: f?.equipped_shoes ?? undefined,
        shorts: f?.equipped_shorts ?? undefined,
        headgear: f?.equipped_headgear ?? undefined,
      },
      inventory: [],
      itemsById: {},
    });
  }
  const { data: items, error: itemsErr } = await supabase
    .from("arena_store_items")
    .select("id, category, name, description, stat_bonuses, emoji")
    .in("id", itemIds);
  if (itemsErr || !items) {
    return NextResponse.json({ message: itemsErr?.message ?? "Failed to load items" }, { status: 500 });
  }
  const itemsById = Object.fromEntries((items as { id: string }[]).map((i) => [i.id, i]));
  const equipped = {
    gloves: f?.equipped_gloves ?? undefined,
    shoes: f?.equipped_shoes ?? undefined,
    shorts: f?.equipped_shorts ?? undefined,
    headgear: f?.equipped_headgear ?? undefined,
  };
  const inventory = (inv ?? []).map((r) => {
    const row = r as { id: string; store_item_id: string; purchased_at: string };
    return {
      id: row.id,
      storeItemId: row.store_item_id,
      purchasedAt: row.purchased_at,
      item: itemsById[row.store_item_id],
      equipped:
        equipped.gloves === row.store_item_id ||
        equipped.shoes === row.store_item_id ||
        equipped.shorts === row.store_item_id ||
        equipped.headgear === row.store_item_id,
    };
  });
  return NextResponse.json({
    fighterId: fighter.id,
    arenaCoins,
    equipped,
    inventory,
    itemsById,
  });
}
