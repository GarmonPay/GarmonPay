import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { creditEscapePayout } from "@/lib/escape-room-db";

/** POST — approve pending payout: body { session_id } */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const { data: s } = await supabase.from("escape_room_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!s) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const row = s as Record<string, unknown>;
  const payout = Number(row.payout_cents ?? 0);
  const playerId = String(row.player_id);
  if (row.result !== "win" || payout <= 0) {
    return NextResponse.json({ error: "No payout due" }, { status: 400 });
  }
  if (row.payout_status === "paid") {
    return NextResponse.json({ ok: true, already_paid: true });
  }

  const pay = await creditEscapePayout(playerId, sessionId, payout);
  if (!pay.ok) {
    return NextResponse.json({ error: pay.message ?? "Ledger error" }, { status: 400 });
  }

  await supabase
    .from("escape_room_sessions")
    .update({
      payout_status: "paid",
      payout_reference: `escape_win_${sessionId}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  const { data: prow } = await supabase.from("escape_room_payouts").select("id").eq("session_id", sessionId).maybeSingle();
  const payload = {
    amount_cents: payout,
    status: "paid" as const,
    paid_at: new Date().toISOString(),
    error_message: null as string | null,
  };
  if (prow) {
    await supabase.from("escape_room_payouts").update(payload).eq("session_id", sessionId);
  } else {
    await supabase.from("escape_room_payouts").insert({
      session_id: sessionId,
      player_id: playerId,
      ...payload,
    });
  }

  return NextResponse.json({ ok: true });
}
