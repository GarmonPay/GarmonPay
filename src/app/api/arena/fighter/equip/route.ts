import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

const SLOT_MAP = {
  gloves: "equipped_gloves",
  shoes: "equipped_shoes",
  shorts: "equipped_shorts",
  headgear: "equipped_headgear",
} as const;

/** POST /api/arena/fighter/equip — equip or unequip an owned item. Body: { slot: 'gloves'|'shoes'|'shorts'|'headgear', storeItemId: uuid | null }. */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { slot?: string; storeItemId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const slot = body.slot;
  const storeItemId = body.storeItemId;
  if (!slot || !(slot in SLOT_MAP)) {
    return NextResponse.json({ message: "slot must be gloves, shoes, shorts, or headgear" }, { status: 400 });
  }

  const { data: fighter, error: fErr } = await supabase
    .from("arena_fighters")
    .select("id, equipped_gloves, equipped_shoes, equipped_shorts, equipped_headgear")
    .eq("user_id", userId)
    .maybeSingle();
  if (fErr || !fighter) {
    return NextResponse.json({ message: "Fighter not found" }, { status: 404 });
  }

  const col = SLOT_MAP[slot as keyof typeof SLOT_MAP];
  if (storeItemId !== undefined && storeItemId !== null) {
    const { data: inv } = await supabase
      .from("arena_fighter_inventory")
      .select("id")
      .eq("fighter_id", fighter.id)
      .eq("store_item_id", storeItemId)
      .maybeSingle();
    if (!inv) {
      return NextResponse.json({ message: "You do not own this item" }, { status: 400 });
    }
    const { data: item } = await supabase
      .from("arena_store_items")
      .select("category")
      .eq("id", storeItemId)
      .maybeSingle();
    const expectedCategory = slot === "gloves" ? "Gloves" : slot === "shoes" ? "Shoes" : slot === "shorts" ? "Shorts" : "Headgear";
    if (!item || (item as { category?: string }).category !== expectedCategory) {
      return NextResponse.json({ message: "Item does not match slot" }, { status: 400 });
    }
  }

  const update: Record<string, string | null> = {
    [col]: storeItemId === undefined || storeItemId === null ? null : storeItemId,
    updated_at: new Date().toISOString(),
  };
  const { error: uErr } = await supabase.from("arena_fighters").update(update).eq("id", fighter.id);
  if (uErr) return NextResponse.json({ message: uErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
