import { NextResponse } from "next/server";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import { getCeloUserId, getUserTierBetLimitCents, admin } from "@/lib/celo-server";

export async function POST(request: Request) {
  try {
    const userId = await getCeloUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const room_id = typeof body.room_id === "string" ? body.room_id : "";
    const role = body.role === "spectator" ? "spectator" : "player";
    const bet_cents = Math.round(Number(body.bet_cents));
    const join_code = typeof body.join_code === "string" ? body.join_code.trim().toUpperCase() : "";

    if (!room_id) {
      return NextResponse.json({ error: "room_id is required" }, { status: 400 });
    }

    const supabase = admin();

    const { data: room, error: roomErr } = await supabase
      .from("celo_rooms")
      .select(
        "id, status, room_type, join_code, max_players, min_bet_cents, max_bet_cents, banker_id, name"
      )
      .eq("id", room_id)
      .maybeSingle();

    if (roomErr || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (!["waiting", "active"].includes(room.status)) {
      return NextResponse.json({ error: "Room is not open for joining" }, { status: 400 });
    }

    if (room.room_type === "private") {
      if (!join_code || join_code !== (room.join_code ?? "")) {
        return NextResponse.json({ error: "Invalid join code" }, { status: 403 });
      }
    }

    const { data: already } = await supabase
      .from("celo_room_players")
      .select("id")
      .eq("room_id", room_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (already) {
      return NextResponse.json({ error: "Already in this room" }, { status: 400 });
    }

    if (room.banker_id === userId && role !== "spectator") {
      return NextResponse.json({ error: "Banker is already in the room" }, { status: 400 });
    }

    if (role === "player") {
      if (!Number.isFinite(bet_cents) || bet_cents < room.min_bet_cents || bet_cents > room.max_bet_cents) {
        const lo = (room.min_bet_cents as number) / 100;
        const hi = (room.max_bet_cents as number) / 100;
        return NextResponse.json(
          { error: `Bet must be between $${lo.toFixed(2)} and $${hi.toFixed(2)}` },
          { status: 400 }
        );
      }

      const tierLimit = await getUserTierBetLimitCents(userId);
      if (bet_cents > tierLimit) {
        return NextResponse.json(
          { error: `Bet exceeds your tier limit ($${(tierLimit / 100).toFixed(2)})` },
          { status: 400 }
        );
      }

      const balance = await getCanonicalBalanceCents(userId);
      if (balance < bet_cents) {
        return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
      }

      const { count, error: countErr } = await supabase
        .from("celo_room_players")
        .select("id", { count: "exact", head: true })
        .eq("room_id", room_id)
        .eq("role", "player");

      if (countErr) {
        return NextResponse.json({ error: countErr.message }, { status: 500 });
      }
      const playerCount = count ?? 0;
      if (playerCount >= room.max_players) {
        return NextResponse.json({ error: "Room is full" }, { status: 400 });
      }

      const ref = `celo_join_${room_id}_${userId}`;
      const ledger = await walletLedgerEntry(userId, "game_play", -bet_cents, ref);
      if (!ledger.success) {
        return NextResponse.json({ error: ledger.message }, { status: 400 });
      }

      const { data: maxSeatRow } = await supabase
        .from("celo_room_players")
        .select("seat_number")
        .eq("room_id", room_id)
        .order("seat_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextSeat = (typeof maxSeatRow?.seat_number === "number" ? maxSeatRow.seat_number : 0) + 1;

      const { error: insErr } = await supabase.from("celo_room_players").insert({
        room_id,
        user_id: userId,
        role: "player",
        bet_cents,
        seat_number: nextSeat,
      });

      if (insErr) {
        await walletLedgerEntry(userId, "game_win", bet_cents, `${ref}_rollback`);
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    } else {
      const { error: insErr } = await supabase.from("celo_room_players").insert({
        room_id,
        user_id: userId,
        role: "spectator",
        bet_cents: 0,
        seat_number: null,
      });
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    await supabase
      .from("celo_rooms")
      .update({ last_activity: new Date().toISOString(), status: "active" })
      .eq("id", room_id);

    await supabase.from("celo_audit_log").insert({
      room_id,
      user_id: userId,
      action: role === "player" ? "player_joined" : "spectator_joined",
      details: { bet_cents: role === "player" ? bet_cents : 0 },
    });

    const { data: players } = await supabase
      .from("celo_room_players")
      .select("id, user_id, role, bet_cents, seat_number")
      .eq("room_id", room_id);

    return NextResponse.json({
      ok: true,
      room_id,
      players: players ?? [],
      balance_cents: role === "player" ? (await getCanonicalBalanceCents(userId)) : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
