import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";
import { getCeloUserId, getUserTierBetLimitCents, admin } from "@/lib/celo-server";

const JOIN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Product limits: $5 min bet, $10,000 max bet per table (amounts in cents). */
const MIN_BET_CENTS_FLOOR = 500;
const MAX_BET_CENTS_CAP = 1_000_000;

function randomJoinCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += JOIN_CHARS[randomInt(0, JOIN_CHARS.length)];
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const userId = await getCeloUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const room_type = body.room_type === "private" ? "private" : "public";
    const max_players = [2, 4, 6].includes(Number(body.max_players)) ? Number(body.max_players) : 6;
    const min_bet_cents = Math.round(Number(body.min_bet_cents));
    const max_bet_cents = Math.round(Number(body.max_bet_cents));
    const speed = ["regular", "fast", "blitz"].includes(body.speed) ? body.speed : "regular";

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!Number.isFinite(min_bet_cents) || min_bet_cents < MIN_BET_CENTS_FLOOR) {
      return NextResponse.json(
        { error: `Minimum bet must be at least $${(MIN_BET_CENTS_FLOOR / 100).toFixed(2)}` },
        { status: 400 }
      );
    }
    if (!Number.isFinite(max_bet_cents) || max_bet_cents > MAX_BET_CENTS_CAP) {
      return NextResponse.json(
        { error: `Maximum bet cannot exceed $${(MAX_BET_CENTS_CAP / 100).toLocaleString()}` },
        { status: 400 }
      );
    }
    if (!Number.isFinite(max_bet_cents) || max_bet_cents < min_bet_cents) {
      return NextResponse.json({ error: "Maximum bet must be greater than or equal to minimum bet" }, { status: 400 });
    }

    const tierLimit = await getUserTierBetLimitCents(userId);
    if (max_bet_cents > tierLimit) {
      return NextResponse.json(
        { error: `Maximum bet exceeds your tier limit ($${(tierLimit / 100).toFixed(2)})` },
        { status: 400 }
      );
    }

    const balance = await getCanonicalBalanceCents(userId);
    /** Worst case one round: every seat bets table max — banker must be solvent for that pot. */
    const requiredBankrollCents = max_players * max_bet_cents;
    if (balance < requiredBankrollCents) {
      return NextResponse.json(
        {
          error: `You need at least $${(requiredBankrollCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in your wallet to open this table (${max_players} seats × $${(max_bet_cents / 100).toFixed(2)} max bet).`,
          balance_cents: balance,
          required_cents: requiredBankrollCents,
        },
        { status: 400 }
      );
    }

    const supabase = admin();

    const { data: existingBankerRoom } = await supabase
      .from("celo_rooms")
      .select("id")
      .eq("banker_id", userId)
      .in("status", ["waiting", "active", "rolling"])
      .maybeSingle();

    if (existingBankerRoom) {
      return NextResponse.json(
        { error: "You already have an active C-Lo room as banker" },
        { status: 400 }
      );
    }

    let join_code: string | null = null;
    if (room_type === "private") {
      for (let attempt = 0; attempt < 12; attempt++) {
        const code = randomJoinCode();
        const { data: clash } = await supabase.from("celo_rooms").select("id").eq("join_code", code).maybeSingle();
        if (!clash) {
          join_code = code;
          break;
        }
      }
      if (!join_code) {
        return NextResponse.json({ error: "Could not allocate join code" }, { status: 500 });
      }
    }

    const { data: room, error: roomErr } = await supabase
      .from("celo_rooms")
      .insert({
        name,
        creator_id: userId,
        banker_id: userId,
        status: "waiting",
        room_type,
        join_code,
        max_players,
        min_bet_cents,
        max_bet_cents,
        speed,
        platform_fee_pct: 10,
        last_activity: new Date().toISOString(),
      })
      .select("id, name, room_type, join_code, max_players, min_bet_cents, max_bet_cents, speed, status, banker_id")
      .single();

    if (roomErr || !room) {
      return NextResponse.json({ error: roomErr?.message ?? "Failed to create room" }, { status: 500 });
    }

    const { error: playerErr } = await supabase.from("celo_room_players").insert({
      room_id: room.id,
      user_id: userId,
      role: "banker",
      bet_cents: 0,
      seat_number: 0,
    });

    if (playerErr) {
      await supabase.from("celo_rooms").delete().eq("id", room.id);
      return NextResponse.json({ error: playerErr.message }, { status: 500 });
    }

    await supabase.from("celo_audit_log").insert({
      room_id: room.id,
      user_id: userId,
      action: "room_created",
      details: { name, room_type, max_players },
    });

    return NextResponse.json({ room, join_code: room.join_code });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
