import { NextResponse } from "next/server";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";
import { getCeloUserId, admin } from "@/lib/celo-server";

/** POST — banker or creator closes the room; refunds seated player stakes when no round is in progress. */
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

    const { data: room, error: roomErr } = await supabase
      .from("celo_rooms")
      .select("id, creator_id, banker_id, status")
      .eq("id", room_id)
      .maybeSingle();

    if (roomErr || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const bankerId = (room as { banker_id: string | null }).banker_id;
    const creatorId = (room as { creator_id: string }).creator_id;
    if (userId !== bankerId && userId !== creatorId) {
      return NextResponse.json({ error: "Only the banker or host can end this game" }, { status: 403 });
    }

    const status = (room as { status: string }).status;
    if (["cancelled", "completed"].includes(status)) {
      return NextResponse.json({ error: "This table is already closed" }, { status: 400 });
    }

    const { data: openRound } = await supabase
      .from("celo_rounds")
      .select("id")
      .eq("room_id", room_id)
      .in("status", ["betting", "banker_rolling", "player_rolling"])
      .maybeSingle();

    if (openRound) {
      return NextResponse.json(
        { error: "Finish or wait for the current round to complete before ending the game" },
        { status: 400 }
      );
    }

    const { data: players, error: pErr } = await supabase
      .from("celo_room_players")
      .select("user_id, role, bet_cents")
      .eq("room_id", room_id);

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    const toRefund =
      players?.filter(
        (r) => (r as { role: string }).role === "player" && Number((r as { bet_cents: number }).bet_cents) > 0
      ) ?? [];

    for (const row of toRefund) {
      const uid = (row as { user_id: string }).user_id;
      const bet = Number((row as { bet_cents: number }).bet_cents);
      const ref = `celo_close_${room_id}_${uid}`;
      const ledger = await walletLedgerEntry(uid, "game_win", bet, ref);
      if (!ledger.success) {
        await supabase.from("celo_audit_log").insert({
          room_id,
          user_id: uid,
          action: "room_close_refund_failed",
          details: { message: ledger.message, bet_cents: bet },
        });
        return NextResponse.json(
          { error: `Could not refund a player (${ledger.message}). Try again or contact support.` },
          { status: 500 }
        );
      }
    }

    await supabase.from("celo_audit_log").insert({
      room_id,
      user_id: userId,
      action: "room_closed",
      details: { refunds: toRefund.length },
    });

    const { error: delErr } = await supabase.from("celo_rooms").delete().eq("id", room_id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      balance_cents: await getCanonicalBalanceCents(userId),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
