import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import { normalizeCeloRoomRow, mergeCeloRoomUpdate } from "@/lib/celo-room-schema";

// Banker has 60 seconds after a C-Lo to lower the bank
const LOWER_BANK_WINDOW_MS = 60_000;

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

  const { room_id, new_bank_cents } = body as {
    room_id?: string;
    new_bank_cents?: number;
  };

  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  if (typeof new_bank_cents !== "number" || new_bank_cents <= 0) {
    return NextResponse.json({ error: "new_bank_cents required" }, { status: 400 });
  }

  const { data: room } = await supabase.from("celo_rooms").select("*").eq("id", room_id).single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const rm = normalizeCeloRoomRow(room as Record<string, unknown>) as {
    banker_id: string;
    current_bank_cents: number;
    min_bet_cents: number;
    last_round_was_celo?: boolean;
    banker_celo_at?: string | null;
    status: string;
  };

  if (rm.banker_id !== userId) {
    return NextResponse.json({ error: "Only the banker can lower the bank" }, { status: 403 });
  }

  if (!rm.last_round_was_celo || rm.banker_celo_at == null) {
    return NextResponse.json(
      { error: "Bank can only be lowered after rolling C-Lo" },
      { status: 400 }
    );
  }

  // Enforce 60-second window
  const celoAt = new Date(rm.banker_celo_at).getTime();
  if (Date.now() - celoAt > LOWER_BANK_WINDOW_MS) {
    return NextResponse.json(
      { error: "C-Lo lower-bank window has expired (60 seconds)" },
      { status: 400 }
    );
  }

  if (new_bank_cents >= rm.current_bank_cents) {
    return NextResponse.json(
      { error: "New bank must be less than current bank" },
      { status: 400 }
    );
  }

  if (new_bank_cents < rm.min_bet_cents) {
    return NextResponse.json(
      { error: `Bank cannot be lower than minimum entry (${rm.min_bet_cents} cents)` },
      { status: 400 }
    );
  }

  if (new_bank_cents % rm.min_bet_cents !== 0) {
    return NextResponse.json(
      { error: `Bank must be a multiple of minimum entry (${rm.min_bet_cents} cents)` },
      { status: 400 }
    );
  }

  const withdrawAmount = rm.current_bank_cents - new_bank_cents;

  // Return excess bank to banker's wallet
  const creditResult = await walletLedgerEntry(
    userId,
    "game_win",
    withdrawAmount,
    `celo_lower_bank_${room_id}_${Date.now()}`
  );

  if (!creditResult.success) {
    return NextResponse.json(
      { error: creditResult.message ?? "Failed to return bank funds" },
      { status: 500 }
    );
  }

  await supabase
    .from("celo_rooms")
    .update(
      mergeCeloRoomUpdate(new_bank_cents, {
        last_round_was_celo: false,
        banker_celo_at: null,
        last_activity: new Date().toISOString(),
      })
    )
    .eq("id", room_id);

  await supabase.from("celo_audit_log").insert({
    room_id,
    user_id: userId,
    action: "bank_lowered",
    details: {
      previous_bank_cents: rm.current_bank_cents,
      new_bank_cents,
      withdraw_amount: withdrawAmount,
    },
  });

  return NextResponse.json({ new_bank_cents, withdraw_amount: withdrawAmount });
}
