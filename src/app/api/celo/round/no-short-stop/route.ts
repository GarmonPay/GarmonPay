import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { broadcastCeloRoomEvent } from "@/lib/celo-roll-broadcast";

/**
 * Banker declares "No Short Stop" for this round — cannot be undone.
 * POST body: { roundId }
 */
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

  const roundId = (body as { roundId?: string }).roundId;
  if (!roundId || typeof roundId !== "string") {
    return NextResponse.json({ error: "roundId required" }, { status: 400 });
  }

  const { data: round, error: roundErr } = await supabase
    .from("celo_rounds")
    .select("id, room_id, banker_id, status, no_short_stop")
    .eq("id", roundId)
    .maybeSingle();

  if (roundErr || !round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const r = round as {
    room_id: string;
    banker_id: string;
    status: string;
    no_short_stop: boolean;
  };

  if (String(r.banker_id) !== String(userId)) {
    return NextResponse.json({ error: "Only the banker can declare no short stop" }, { status: 403 });
  }

  if (!["banker_rolling", "player_rolling"].includes(r.status)) {
    return NextResponse.json(
      { error: "No short stop can only be declared during an active rolling phase" },
      { status: 400 }
    );
  }

  if (r.no_short_stop) {
    return NextResponse.json({ success: true, noShortStop: true });
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("celo_rounds")
    .update({ no_short_stop: true })
    .eq("id", roundId)
    .eq("no_short_stop", false);

  if (upErr) {
    return NextResponse.json({ error: upErr.message ?? "Update failed" }, { status: 500 });
  }

  await broadcastCeloRoomEvent(supabase, r.room_id, "short_stop", {
    roomId: r.room_id,
    roundId,
    kind: "no_short_stop_declared",
    at: now,
    rollerUserId: userId,
  });

  await supabase.from("celo_audit_log").insert({
    room_id: r.room_id,
    round_id: roundId,
    user_id: userId,
    action: "no_short_stop_declared",
    details: {},
  });

  return NextResponse.json({ success: true, noShortStop: true });
}
