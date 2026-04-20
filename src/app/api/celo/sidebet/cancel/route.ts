import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { creditCoins, getUserCoins } from "@/lib/coins";

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: { bet_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const betId = typeof body.bet_id === "string" ? body.bet_id : null;
  if (!betId) return NextResponse.json({ message: "bet_id required" }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: betRaw, error: bErr } = await supabase.from("celo_side_bets").select("*").eq("id", betId).maybeSingle();
  if (bErr || !betRaw) return NextResponse.json({ message: "Entry not found" }, { status: 404 });

  const bet = betRaw as Record<string, unknown>;
  if (String(bet.creator_id) !== userId) {
    return NextResponse.json({ message: "Only the poster can cancel" }, { status: 403 });
  }
  if (String(bet.status) !== "open") {
    return NextResponse.json({ message: "Entry is not open" }, { status: 400 });
  }

  const amount = Math.floor(Number(bet.amount_cents ?? 0));
  const credit = await creditCoins(
    userId,
    0,
    amount,
    "C-Lo side entry refund (cancel)",
    `celo_side_cancel_refund_${betId}`,
    "celo_payout"
  );
  if (!credit.success) {
    return NextResponse.json({ message: credit.message ?? "Refund failed" }, { status: 500 });
  }

  const { error: uErr } = await supabase
    .from("celo_side_bets")
    .update({ status: "cancelled", settled_at: new Date().toISOString() })
    .eq("id", betId)
    .eq("status", "open");

  if (uErr) {
    return NextResponse.json({ message: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, gpayCoins: (await getUserCoins(userId)).gpayCoins });
}
