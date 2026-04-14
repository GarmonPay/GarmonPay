import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { deductGPay, creditGPay, getGPayBalance } from "@/lib/gpay-balance";
import { DICE_TYPES, type DiceType } from "@/lib/celo-engine";

const DICE_EXPIRY_HOURS = 24;
const MAX_DICE_QUANTITY = 3;

export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { room_id, dice_type, quantity } = body as {
    room_id?: string;
    dice_type?: string;
    quantity?: number;
  };

  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  if (!dice_type || !(dice_type in DICE_TYPES)) {
    return NextResponse.json(
      { error: `dice_type must be one of: ${Object.keys(DICE_TYPES).join(", ")}` },
      { status: 400 }
    );
  }

  const diceConfig = DICE_TYPES[dice_type as DiceType];

  if (diceConfig.costCents === 0) {
    return NextResponse.json({ error: "Standard dice are free and always available" }, { status: 400 });
  }

  const qty = typeof quantity === "number" ? quantity : 1;
  if (qty < 1 || qty > MAX_DICE_QUANTITY || !Number.isInteger(qty)) {
    return NextResponse.json(
      { error: `Quantity must be 1–${MAX_DICE_QUANTITY}` },
      { status: 400 }
    );
  }

  // Verify user is a player in this room
  const { data: playerRows } = await supabase
    .from("celo_room_players")
    .select("role")
    .eq("room_id", room_id)
    .eq("user_id", userId)
    .limit(1);

  const playerEntry = celoFirstRow(playerRows);
  if (!playerEntry || (playerEntry as { role: string }).role === "spectator") {
    return NextResponse.json({ error: "Must be a player in this room" }, { status: 403 });
  }

  const totalCost = diceConfig.costCents * qty;

  const balanceGpay = await getGPayBalance(userId);
  if (balanceGpay < totalCost) {
    return NextResponse.json(
      { error: `Insufficient $GPAY. Need ${totalCost} for ${qty}x ${diceConfig.name} dice` },
      { status: 400 }
    );
  }

  const deductResult = await deductGPay(userId, totalCost, balanceGpay, {
    description: "C-Lo dice purchase",
    reference: `celo_dice_buy_${dice_type}_${room_id}_${Date.now()}`,
  });

  if (!deductResult.ok) {
    return NextResponse.json(
      { error: deductResult.message ?? "Failed to deduct dice cost" },
      { status: 400 }
    );
  }

  const expiresAt = new Date(Date.now() + DICE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  // Update player's dice in room
  const { error: updateErr } = await supabase
    .from("celo_room_players")
    .update({
      dice_type,
      dice_quantity: qty,
      dice_expires_at: expiresAt,
    })
    .eq("room_id", room_id)
    .eq("user_id", userId);

  if (updateErr) {
    await creditGPay(userId, totalCost, {
      description: "C-Lo dice purchase refund",
      reference: `celo_dice_buy_refund_${dice_type}_${room_id}_${Date.now()}`,
    });
    return NextResponse.json({ error: "Failed to equip dice" }, { status: 500 });
  }

  await supabase.from("celo_audit_log").insert({
    room_id,
    user_id: userId,
    action: "dice_purchased",
    details: {
      dice_type,
      quantity: qty,
      total_cost_cents: totalCost,
      expires_at: expiresAt,
    },
  });

  return NextResponse.json({
    dice_type,
    quantity: qty,
    total_cost_cents: totalCost,
    expires_at: expiresAt,
  });
}
