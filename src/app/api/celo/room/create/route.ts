import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import {
  walletLedgerEntry,
  getCanonicalBalanceCents,
  ensureWalletBalancesRow,
} from "@/lib/wallet-ledger";
import { CELO_ROOMS_COL } from "@/lib/celo-room-schema";

/**
 * `celo_rooms` production columns: minimum_entry_sc, current_bank_sc (see user DB audit).
 * Do not insert min_bet_cents / current_bank_cents unless those columns exist.
 *
 * RLS: service role bypasses RLS.
 */

const ALLOWED_MAX_PLAYERS = [2, 4, 6, 10] as const;
const MIN_BET_CENTS = 500;

type PgLike = { message: string; code?: string; details?: string | null; hint?: string | null };

function serializeErr(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  return { value: String(err) };
}

function jsonDbFailure(label: string, err: PgLike | null | undefined): NextResponse {
  console.error(`[celo/room/create] ${label}`, err);
  return NextResponse.json(
    {
      error: "Failed to create room",
      details: err?.message ?? "Unknown database error",
      code: err?.code ?? null,
    },
    { status: 500 }
  );
}

export async function POST(req: Request) {
  try {
    console.error("[celo/room/create] step: start");
    const userId = await getAuthUserIdStrict(req);
    if (!userId) {
      console.error("[celo/room/create] step: auth failed");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[celo/room/create] step: authenticated userId=", userId);

    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[celo/room/create] step: no Supabase admin client");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const {
      name,
      room_type,
      max_players,
      minimum_entry_cents,
      starting_bank_cents,
      join_code,
    } = body as {
      name?: string;
      room_type?: string;
      max_players?: number;
      minimum_entry_cents?: number;
      starting_bank_cents?: number;
      join_code?: string;
    };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Room name is required" }, { status: 400 });
    }

    if (!ALLOWED_MAX_PLAYERS.includes(max_players as (typeof ALLOWED_MAX_PLAYERS)[number])) {
      return NextResponse.json(
        { error: "Max players must be 2, 4, 6, or 10" },
        { status: 400 }
      );
    }

    const maxPlayersNum = max_players as number;

    if (!minimum_entry_cents || minimum_entry_cents < MIN_BET_CENTS) {
      return NextResponse.json(
        { error: `Minimum entry must be at least ${MIN_BET_CENTS} cents ($5)` },
        { status: 400 }
      );
    }

    if (minimum_entry_cents % MIN_BET_CENTS !== 0) {
      return NextResponse.json(
        { error: "Minimum entry must be a multiple of 500 cents ($5)" },
        { status: 400 }
      );
    }

    const requiredBankCents = minimum_entry_cents * maxPlayersNum;
    if (!starting_bank_cents || starting_bank_cents < requiredBankCents) {
      return NextResponse.json(
        {
          error: `Banker must hold at least $${(requiredBankCents / 100).toFixed(2)} to cover all ${maxPlayersNum} players at the minimum entry of $${(minimum_entry_cents / 100).toFixed(2)}`,
        },
        { status: 400 }
      );
    }

    if (room_type === "private" && (!join_code || typeof join_code !== "string" || join_code.trim().length === 0)) {
      return NextResponse.json(
        { error: "Private rooms require a join code" },
        { status: 400 }
      );
    }

    console.error("[celo/room/create] step: ensureWalletBalancesRow");
    try {
      const ensured = await ensureWalletBalancesRow(userId);
      if (!ensured.ok) {
        console.error("[celo/room/create] ensureWalletBalancesRow failed:", ensured.message, ensured.code);
        return NextResponse.json(
          { error: ensured.message, details: ensured.message, code: ensured.code ?? null },
          { status: 500 }
        );
      }
    } catch (err: unknown) {
      console.error("[celo/room/create] ensureWalletBalancesRow threw:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err), details: serializeErr(err) },
        { status: 500 }
      );
    }

    console.error("[celo/room/create] step: getCanonicalBalanceCents");
    let balanceCents: number;
    try {
      balanceCents = await getCanonicalBalanceCents(userId);
    } catch (err: unknown) {
      console.error("[celo/room/create] getCanonicalBalanceCents threw:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err), details: serializeErr(err) },
        { status: 500 }
      );
    }

    console.error("[celo/room/create] step: balanceCents=", balanceCents, "need=", starting_bank_cents);

    if (balanceCents < starting_bank_cents) {
      return NextResponse.json(
        { error: "Insufficient balance to cover the starting bank" },
        { status: 400 }
      );
    }

    // Insert only columns present on production: *_sc bank fields, no speed/max_bet unless migrated
    // Balance is validated above; deduction happens ONLY after room (+ player + audit) rows exist.
    console.error("[celo/room/create] step: insert celo_rooms");
    let room: {
      id: string;
      name: string;
      room_type: string;
      [key: string]: unknown;
    };
    try {
      const insertPayload: Record<string, unknown> = {
        name: name.trim(),
        creator_id: userId,
        banker_id: userId,
        room_type: room_type === "private" ? "private" : "public",
        max_players: max_players as number,
        [CELO_ROOMS_COL.minimumEntry]: minimum_entry_cents,
        [CELO_ROOMS_COL.currentBank]: starting_bank_cents,
        join_code: room_type === "private" ? join_code!.trim() : null,
        status: "waiting",
        total_rounds: 0,
      };
      const { data: roomData, error: roomError } = await supabase
        .from("celo_rooms")
        .insert(insertPayload)
        .select()
        .single();

      if (roomError) {
        console.error("[celo/room/create] Exact error (celo_rooms):", roomError);
        return jsonDbFailure("celo_rooms insert", roomError as PgLike);
      }

      if (!roomData) {
        console.error("[celo/room/create] celo_rooms insert returned no row");
        return NextResponse.json(
          {
            error: "Failed to create room",
            details: "Insert succeeded but no row returned",
            code: null,
          },
          { status: 500 }
        );
      }
      room = roomData as typeof room;
    } catch (err: unknown) {
      console.error("[celo/room/create] celo_rooms insert threw:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err), details: serializeErr(err) },
        { status: 500 }
      );
    }

    // celo_room_players: room_id, user_id, role, bet_cents, seat_number (+ dice_* defaults in DB)
    console.error("[celo/room/create] step: insert celo_room_players room_id=", room.id);
    try {
      const { error: playerError } = await supabase.from("celo_room_players").insert({
        room_id: room.id,
        user_id: userId,
        role: "banker",
        bet_cents: 0,
        seat_number: 0,
      });

      if (playerError) {
        console.error("[celo/room/create] Exact error (celo_room_players):", playerError);
        await supabase.from("celo_rooms").delete().eq("id", room.id);
        return jsonDbFailure("celo_room_players insert", playerError as PgLike);
      }
    } catch (err: unknown) {
      console.error("[celo/room/create] celo_room_players insert threw:", err);
      try {
        await supabase.from("celo_rooms").delete().eq("id", room.id);
      } catch (e2: unknown) {
        console.error("[celo/room/create] rollback room after player throw failed:", e2);
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err), details: serializeErr(err) },
        { status: 500 }
      );
    }

    console.error("[celo/room/create] step: insert celo_audit_log");
    try {
      const { error: auditError } = await supabase.from("celo_audit_log").insert({
        room_id: room.id,
        user_id: userId,
        action: "room_created",
        details: {
          name: room.name,
          max_players,
          minimum_entry_cents,
          starting_bank_cents,
          room_type: room.room_type,
        },
      });

      if (auditError) {
        console.error("[celo/room/create] Exact error (celo_audit_log):", auditError);
        await supabase.from("celo_room_players").delete().eq("room_id", room.id);
        await supabase.from("celo_rooms").delete().eq("id", room.id);
        return jsonDbFailure("celo_audit_log insert", auditError as PgLike);
      }
    } catch (err: unknown) {
      console.error("[celo/room/create] celo_audit_log insert threw:", err);
      try {
        await supabase.from("celo_room_players").delete().eq("room_id", room.id);
        await supabase.from("celo_rooms").delete().eq("id", room.id);
      } catch (e2: unknown) {
        console.error("[celo/room/create] rollback after audit throw failed:", e2);
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err), details: serializeErr(err) },
        { status: 500 }
      );
    }

    console.error("[celo/room/create] step: walletLedgerEntry deduct (after room persisted)");
    let deductResult: Awaited<ReturnType<typeof walletLedgerEntry>>;
    try {
      deductResult = await walletLedgerEntry(
        userId,
        "game_play",
        -starting_bank_cents,
        `celo_bank_deposit_${room.id}`
      );
    } catch (err: unknown) {
      console.error("[celo/room/create] walletLedgerEntry (deduct) threw:", err);
      try {
        await supabase.from("celo_audit_log").delete().eq("room_id", room.id);
        await supabase.from("celo_room_players").delete().eq("room_id", room.id);
        await supabase.from("celo_rooms").delete().eq("id", room.id);
      } catch (rollbackErr: unknown) {
        console.error("[celo/room/create] rollback after deduct throw failed:", rollbackErr);
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err), details: serializeErr(err) },
        { status: 500 }
      );
    }

    if (!deductResult.success) {
      console.error("[celo/room/create] walletLedgerEntry (deduct) failed:", deductResult.message);
      try {
        await supabase.from("celo_audit_log").delete().eq("room_id", room.id);
        await supabase.from("celo_room_players").delete().eq("room_id", room.id);
        await supabase.from("celo_rooms").delete().eq("id", room.id);
      } catch (rollbackErr: unknown) {
        console.error("[celo/room/create] rollback after deduct failure failed:", rollbackErr);
      }
      return NextResponse.json(
        {
          error: deductResult.message ?? "Failed to reserve bank funds",
          details: deductResult.message,
          code: null,
        },
        { status: 400 }
      );
    }

    console.error("[celo/room/create] step: success room_id=", room.id);
    return NextResponse.json({ room });
  } catch (err: unknown) {
    console.error("[celo/room/create] unhandled top-level:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        details: serializeErr(err),
      },
      { status: 500 }
    );
  }
}
