import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { debitGpayCoins } from "@/lib/coins";
import { normalizeCeloUserId } from "@/lib/celo-player-state";
import { validateEntry } from "@/lib/celo-engine";

/**
 * Banker adds GPC from personal balance to the table bank (between rounds).
 * Rejected when bank is busted (no valid banker chain) or server rules disallow.
 */
export async function POST(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const auth = await getCeloAuth(request, clients);
  if (!auth) {
    return celoUnauthorizedJsonResponse();
  }
  const { user, adminClient: admin } = auth;
  const userId = user.id;

  let body: { room_id?: string; amount_sc?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "").trim();
  const amountSc = Math.floor(Number(body.amount_sc ?? 0));
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  if (!Number.isFinite(amountSc) || amountSc < 500) {
    return NextResponse.json(
      { error: "amount_sc must be at least 500" },
      { status: 400 }
    );
  }

  const { data: roomRaw, error: roomErr } = await admin
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr || !roomRaw) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const room = roomRaw as {
    banker_id: string | null;
    status: string;
    current_bank_sc: number | null;
    current_bank_cents: number | null;
    minimum_entry_sc: number | null;
    min_bet_cents: number | null;
    bank_busted?: boolean | null;
  };

  const action = "bank_add_attempt";

  if (room.bank_busted === true) {
    console.log("[C-Lo banker bank rule]", {
      roomId,
      bankerId: room.banker_id,
      userId,
      currentBankSc: room.current_bank_sc,
      bankBusted: true,
      winnerUserId: null,
      action,
    });
    return NextResponse.json(
      {
        error:
          "Bank is busted. Banker must change before more GPC can be added.",
      },
      { status: 400 }
    );
  }

  if (
    !room.banker_id ||
    normalizeCeloUserId(room.banker_id) !== normalizeCeloUserId(userId)
  ) {
    return NextResponse.json(
      { error: "Only the current banker can add to the bank" },
      { status: 403 }
    );
  }

  const rs = String(room.status ?? "").toLowerCase();
  if (rs !== "waiting") {
    return NextResponse.json(
      {
        error:
          "You can only add to the bank between rounds (room must be waiting).",
      },
      { status: 400 }
    );
  }

  const curBank = Math.max(
    0,
    Math.floor(
      Number(room.current_bank_sc ?? room.current_bank_cents ?? 0)
    )
  );

  const minE = Math.max(
    500,
    Math.floor(Number(room.minimum_entry_sc ?? room.min_bet_cents ?? 500))
  );
  const v = validateEntry(amountSc, minE);
  if (!v.valid) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  const debitRef = `celo_bank_add_${roomId}_${userId}_${Date.now()}`;
  const debit = await debitGpayCoins(
    userId,
    amountSc,
    "C-Lo add to table bank",
    debitRef,
    "celo_entry"
  );
  if (!debit.success) {
    return NextResponse.json(
      { error: debit.message ?? "Debit failed" },
      { status: 400 }
    );
  }

  const nextBank = curBank + amountSc;
  const { data: updated, error: upErr } = await admin
    .from("celo_rooms")
    .update({
      current_bank_sc: nextBank,
      current_bank_cents: nextBank,
      bank_busted: false,
      last_activity: new Date().toISOString(),
    })
    .eq("id", roomId)
    .eq("banker_id", room.banker_id)
    .select("*")
    .maybeSingle();

  if (upErr || !updated) {
    const { creditCoins } = await import("@/lib/coins");
    await creditCoins(
      userId,
      0,
      amountSc,
      "C-Lo bank add revert",
      `celo_bank_add_revert_${debitRef}`,
      "celo_bank_refund"
    );
    return NextResponse.json(
      { error: upErr?.message ?? "Could not update bank" },
      { status: 500 }
    );
  }

  console.log("[C-Lo banker bank rule]", {
    roomId,
    bankerId: room.banker_id,
    userId,
    currentBankSc: nextBank,
    bankBusted: false,
    winnerUserId: null,
    action: "bank_add_ok",
  });

  return NextResponse.json({ ok: true as const, room: updated });
}
