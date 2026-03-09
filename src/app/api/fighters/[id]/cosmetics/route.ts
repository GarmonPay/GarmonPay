import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

type PurchaseBody = {
  item_id?: string;
  slot?: "gloves" | "shorts" | "shoes";
  color?: string;
  cost_cents?: number;
};

/** POST /api/fighters/[id]/cosmetics — buy + equip cosmetic item from wallet. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const fighterId = params.id?.trim();
  if (!fighterId) return NextResponse.json({ error: "fighter id required" }, { status: 400 });

  let body: PurchaseBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const itemId = typeof body.item_id === "string" ? body.item_id.trim().slice(0, 64) : "";
  const color = typeof body.color === "string" ? body.color.trim().toLowerCase().slice(0, 32) : "";
  const slot = body.slot;
  const costCents = typeof body.cost_cents === "number" ? Math.max(0, Math.round(body.cost_cents)) : 0;

  if (!itemId || !color || !slot) {
    return NextResponse.json({ error: "item_id, slot, color required" }, { status: 400 });
  }

  const { data: fighter, error: fighterErr } = await supabase
    .from("fighters")
    .select("id, owned_cosmetics")
    .eq("id", fighterId)
    .eq("user_id", userId)
    .maybeSingle();
  if (fighterErr || !fighter) return NextResponse.json({ error: "Fighter not found" }, { status: 404 });

  const owned = ((fighter as { owned_cosmetics?: Record<string, boolean> }).owned_cosmetics ??
    {}) as Record<string, boolean>;
  const alreadyOwned = owned[itemId] === true;

  let balanceCents: number | undefined;
  if (!alreadyOwned && costCents > 0) {
    const ref = `fighter_cosmetic_${fighterId}_${itemId}_${Date.now()}`;
    const ledger = await walletLedgerEntry(userId, "game_play", -costCents, ref);
    if (!ledger.success) {
      return NextResponse.json({ error: ledger.message ?? "Insufficient balance" }, { status: 400 });
    }
    balanceCents = ledger.balance_cents;
  }

  const nextOwned = { ...owned, [itemId]: true };
  const cosmeticColumn =
    slot === "gloves"
      ? "gloves_color"
      : slot === "shorts"
      ? "shorts_color"
      : "shoes_color";

  const { data: updated, error: upErr } = await supabase
    .from("fighters")
    .update({
      owned_cosmetics: nextOwned,
      [cosmeticColumn]: color,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fighterId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (upErr || !updated) {
    return NextResponse.json({ error: "Failed to apply cosmetic" }, { status: 500 });
  }

  return NextResponse.json({
    fighter: updated,
    purchased: !alreadyOwned,
    balance_cents: balanceCents,
  });
}
