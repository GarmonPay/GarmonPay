import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import {
  walletLedgerEntry,
  getCanonicalBalanceCents,
  ensureWalletBalancesRow,
} from "@/lib/wallet-ledger";

/**
 * celo_rooms columns used here (see migrations 20260329150000, 20260401100000, 20260402000000):
 * name, creator_id, banker_id, room_type, max_players, min_bet_cents, max_bet_cents,
 * current_bank_cents, speed, join_code, status — plus DB defaults for platform_fee_pct, last_activity, etc.
 *
 * RLS: route uses service role (admin client), which bypasses RLS. Authenticated INSERT policy exists in migration.
 *
 * Balance: public.users.balance (cents) + public.wallet_balances.balance via ensureWalletBalancesRow + getCanonicalBalanceCents.
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
      speed,
    } = body as {
      name?: string;
      room_type?: string;
      max_players?: number;
      minimum_entry_cents?: number;
      starting_bank_cents?: number;
      join_code?: string;
      speed?: string;
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

    if (!starting_bank_cents || starting_bank_cents < minimum_entry_cents) {
      return NextResponse.json(
        { error: "Starting bank must be at least the minimum entry" },
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

    console.error("[celo/room/create] step: walletLedgerEntry deduct");
    let deductResult: Awaited<ReturnType<typeof walletLedgerEntry>>;
    try {
      deductResult = await walletLedgerEntry(
        userId,
        "game_play",
        -starting_bank_cents,
        `celo_bank_deposit_${Date.now()}`
      );
    } catch (err: unknown) {
      console.error("[celo/room/create] walletLedgerEntry (deduct) threw:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err), details: serializeErr(err) },
        { status: 500 }
      );
    }

    if (!deductResult.success) {
      console.error("[celo/room/create] walletLedgerEntry (deduct) failed:", deductResult.message);
      return NextResponse.json(
        {
          error: deductResult.message ?? "Failed to reserve bank funds",
          details: deductResult.message,
          code: null,
        },
        { status: 400 }
      );
    }

    // celo_rooms: only columns that exist in schema (see migration comments at top of file)
    console.error("[celo/room/create] step: insert celo_rooms");
    let room: {
      id: string;
      name: string;
      room_type: string;
      [key: string]: unknown;
    };
    try {
      const { data: roomData, error: roomError } = await supabase
        .from("celo_rooms")
        .insert({
          name: name.trim(),
          creator_id: userId,
          banker_id: userId,
          room_type: room_type === "private" ? "private" : "public",
          max_players: max_players as number,
          min_bet_cents: minimum_entry_cents,
          max_bet_cents: Math.max(minimum_entry_cents * 10, starting_bank_cents),
          current_bank_cents: starting_bank_cents,
          speed: ["regular", "fast", "blitz"].includes(speed ?? "") ? speed : "regular",
          join_code: room_type === "private" ? join_code!.trim() : null,
          status: "waiting",
        })
        .select()
        .single();

      if (roomError) {
        console.error("[celo/room/create] Exact error (celo_rooms):", roomError);
        try {
          const refund = await walletLedgerEntry(
            userId,
            "game_win",
            starting_bank_cents,
            `celo_bank_refund_creation_failed_${Date.now()}`
          );
          if (!refund.success) {
            console.error("[celo/room/create] refund after failed insert:", refund.message);
          }
        } catch (refundErr: unknown) {
          console.error("[celo/room/create] refund threw:", refundErr);
          return NextResponse.json(
            {
              error: roomError.message,
              details: serializeErr(roomError),
              code: roomError.code,
              refundError: serializeErr(refundErr),
            },
            { status: 500 }
          );
        }
        return jsonDbFailure("celo_rooms insert", roomError as PgLike);
      }

      if (!roomData) {
        console.error("[celo/room/create] celo_rooms insert returned no row");
        await walletLedgerEntry(
          userId,
          "game_win",
          starting_bank_cents,
          `celo_bank_refund_creation_failed_${Date.now()}`
        );
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
      try {
        await walletLedgerEntry(
          userId,
          "game_win",
          starting_bank_cents,
          `celo_bank_refund_creation_failed_${Date.now()}`
        );
      } catch (e2: unknown) {
        console.error("[celo/room/create] refund after throw failed:", e2);
      }
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
        const refund = await walletLedgerEntry(
          userId,
          "game_win",
          starting_bank_cents,
          `celo_bank_refund_player_insert_failed_${Date.now()}`
        );
        if (!refund.success) {
          console.error("[celo/room/create] refund after player insert failed:", refund.message);
        }
        return jsonDbFailure("celo_room_players insert", playerError as PgLike);
      }
    } catch (err: unknown) {
      console.error("[celo/room/create] celo_room_players insert threw:", err);
      try {
        await supabase.from("celo_rooms").delete().eq("id", room.id);
        await walletLedgerEntry(
          userId,
          "game_win",
          starting_bank_cents,
          `celo_bank_refund_player_insert_failed_${Date.now()}`
        );
      } catch (e2: unknown) {
        console.error("[celo/room/create] rollback after player throw failed:", e2);
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
        const refund = await walletLedgerEntry(
          userId,
          "game_win",
          starting_bank_cents,
          `celo_bank_refund_audit_failed_${Date.now()}`
        );
        if (!refund.success) {
          console.error("[celo/room/create] refund after audit failed:", refund.message);
        }
        return jsonDbFailure("celo_audit_log insert", auditError as PgLike);
      }
    } catch (err: unknown) {
      console.error("[celo/room/create] celo_audit_log insert threw:", err);
      try {
        await supabase.from("celo_room_players").delete().eq("room_id", room.id);
        await supabase.from("celo_rooms").delete().eq("id", room.id);
        await walletLedgerEntry(
          userId,
          "game_win",
          starting_bank_cents,
          `celo_bank_refund_audit_failed_${Date.now()}`
        );
      } catch (e2: unknown) {
        console.error("[celo/room/create] rollback after audit throw failed:", e2);
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err), details: serializeErr(err) },
        { status: 500 }
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
