import { NextResponse } from "next/server";
import { getJackpotCurrent } from "@/lib/pinball-games";

/** GET /api/pinball/jackpot/current — Current jackpot amount (cents). */
export async function GET() {
  try {
    const jackpot = await getJackpotCurrent();
    return NextResponse.json({
      current_amount_cents: jackpot.current_amount_cents,
      last_won_at: jackpot.last_won_at,
      last_winner_id: jackpot.last_winner_id,
    });
  } catch (e) {
    console.error("Pinball jackpot current error:", e);
    return NextResponse.json({ error: "Failed to load jackpot" }, { status: 500 });
  }
}
