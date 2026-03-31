import { NextResponse } from "next/server";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";
import { getCeloUserId, admin } from "@/lib/celo-server";

/** POST — leave the table (spectators anytime; players get stake back only when no round is in progress). Banker must use /close. */
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
      .select("id, banker_id, status")
      .eq("id", room_id)
      .maybeSingle();

    if (roomErr || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const bankerId = (room as { banker_id: string | null }).banker_id;
    const status = (room as { status: string }).status;
    if (bankerId === userId) {
      return NextResponse.json({ error: "Banker cannot leave — use End game to close the table" }, { status: 400 });
    }
    if (["cancelled", "completed"].includes(status)) {
      return NextResponse.json({ error: "This table is closed" }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from("celo_room_players")
      .select("id, role, bet_cents")
      .eq("room_id", room_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "You are not seated at this table" }, { status: 400 });
    }

    const role = (membership as { role: string }).role;
    const betCents = Number((membership as { bet_cents: number }).bet_cents ?? 0);

    const { data: openRound } = await supabase
      .from("celo_rounds")
      .select("id")
      .eq("room_id", room_id)
      .in("status", ["betting", "banker_rolling", "player_rolling"])
      .maybeSingle();

    if (openRound && role === "player" && betCents > 0) {
      return NextResponse.json(
        { error: "Wait for the current round to finish before leaving with a stake" },
        { status: 400 }
      );
    }

    if (role === "player" && betCents > 0) {
      const ref = `celo_leave_${room_id}_${userId}`;
      const ledger = await walletLedgerEntry(userId, "game_win", betCents, ref);
      if (!ledger.success) {
        return NextResponse.json({ error: ledger.message }, { status: 400 });
      }
    }

    const { error: delErr } = await supabase
      .from("celo_room_players")
      .delete()
      .eq("room_id", room_id)
      .eq("user_id", userId);
    if (delErr) {
      if (role === "player" && betCents > 0) {
        await walletLedgerEntry(userId, "game_play", -betCents, `celo_leave_${room_id}_${userId}_rollback`);
      }
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    await supabase
      .from("celo_rooms")
      .update({ last_activity: new Date().toISOString() })
      .eq("id", room_id);

    await supabase.from("celo_audit_log").insert({
      room_id,
      user_id: userId,
      action: "player_left",
      details: { role, refunded_cents: role === "player" ? betCents : 0 },
    });

    return NextResponse.json({
      ok: true,
      balance_cents: await getCanonicalBalanceCents(userId),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
