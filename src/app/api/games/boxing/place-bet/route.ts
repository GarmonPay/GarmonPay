import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

/**
 * POST /api/games/boxing/place-bet
 * Deducts bet from user balance (e.g. before an AI fight). Saves bet via wallet ledger + transactions.
 * Body: { amount_cents: number }
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { amount_cents?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amountCents = typeof body.amount_cents === "number" ? Math.round(body.amount_cents) : 0;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { error: "amount_cents must be a positive number (cents)" },
      { status: 400 }
    );
  }

  const reference = `fight_ai_entry_${userId}_${Date.now()}`;
  const result = await walletLedgerEntry(userId, "game_play", -amountCents, reference);
  if (!result.success) {
    return NextResponse.json(
      { error: result.message ?? "Deduction failed" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  if (supabase) {
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "fight_entry",
      amount: amountCents,
      status: "completed",
      description: "Boxing arena bet (AI fight)",
      reference_id: reference,
    }).then(({ error }) => {
      if (error) console.error("[boxing place-bet] transaction insert:", error.message);
    });
  }

  return NextResponse.json({
    success: true,
    amount_cents: amountCents,
    balance_cents: "balance_cents" in result ? result.balance_cents : undefined,
  });
}
