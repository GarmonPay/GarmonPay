import { NextResponse } from "next/server";
import { executePlayerRoll } from "@/lib/celo-execute-player-roll";
import { rotateBankerAfterRound } from "@/lib/celo-banker-rotation";
import { getCeloUserId, admin } from "@/lib/celo-server";

/** POST /api/celo/round/roll — player point-round roll (canonical); rotates banker when round completes. */
export async function POST(request: Request) {
  try {
    const userId = await getCeloUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const room_id = typeof body.room_id === "string" ? body.room_id : "";
    if (!room_id) {
      return NextResponse.json({ error: "room_id is required" }, { status: 400 });
    }

    const supabase = admin();
    const result = await executePlayerRoll(supabase, userId, room_id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (result.round_completed) {
      await rotateBankerAfterRound(supabase, room_id);
    }

    return NextResponse.json({
      ok: true,
      roll: result.roll,
      round_completed: result.round_completed,
      payout_cents: result.payout_cents,
      outcome: result.roll.outcome,
      payout: result.payout_cents,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
