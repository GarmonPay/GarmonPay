import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import { logTimer } from "@/lib/escape-room-db";

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
  const notes = typeof body.reason === "string" ? body.reason : "voided by admin";

  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const { data: s } = await supabase.from("escape_room_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!s) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = s as Record<string, unknown>;
  if (row.result === "voided") {
    return NextResponse.json({ ok: true, already_voided: true });
  }

  const playerId = String(row.player_id);
  const paid = Number(row.payout_cents ?? 0);
  const payoutStatus = String(row.payout_status ?? "none");

  if (payoutStatus === "paid" && paid > 0) {
    const rev = await walletLedgerEntry(
      playerId,
      "admin_adjustment",
      -paid,
      `escape_void_reverse_${sessionId}`
    );
    if (!rev.success) {
      return NextResponse.json({ error: rev.message ?? "Could not reverse payout" }, { status: 400 });
    }
  }

  await supabase
    .from("escape_room_payouts")
    .update({ status: "voided", updated_at: new Date().toISOString() })
    .eq("session_id", sessionId);

  await supabase
    .from("escape_room_sessions")
    .update({
      result: "voided",
      payout_status: "voided",
      metadata: {
        ...(typeof row.metadata === "object" && row.metadata ? (row.metadata as object) : {}),
        void_reason: notes,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  await logTimer(sessionId, "void", { notes });

  return NextResponse.json({ ok: true });
}
