import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { mergeCeloRoomUpdate, normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { celoBankRefundReference, celoPlayerStakeRefundReference } from "@/lib/celo-room-refund-refs";
import { walletLedgerGameWinIdempotent } from "@/lib/celo-wallet-idempotent";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import { settleCeloOpenSideBets } from "@/lib/celo-side-bets-settle";

/** GET /api/admin/celo/rooms — all C-Lo rooms with banker email and player count. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: rooms, error } = await supabase
    .from("celo_rooms")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const list = rooms ?? [];
  const bankerIds = Array.from(
    new Set(
      list
        .map((r) => String((r as Record<string, unknown>).banker_id ?? ""))
        .filter((id) => id.length > 0)
    )
  );
  const roomIds = list.map((r) => String((r as Record<string, unknown>).id ?? "")).filter(Boolean);

  const emailMap = new Map<string, string | null>();
  if (bankerIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id, email").in("id", bankerIds);
    for (const u of users ?? []) {
      const row = u as { id: string; email?: string | null };
      emailMap.set(row.id, row.email ?? null);
    }
  }

  const countMap = new Map<string, number>();
  if (roomIds.length > 0) {
    const { data: prs } = await supabase.from("celo_room_players").select("room_id").in("room_id", roomIds);
    for (const p of prs ?? []) {
      const rid = String((p as { room_id: string }).room_id);
      countMap.set(rid, (countMap.get(rid) ?? 0) + 1);
    }
  }

  const enriched = list.map((raw) => {
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? "");
    const norm = normalizeCeloRoomRow(row);
    const bankerId = String(row.banker_id ?? "");
    return {
      id,
      name: String(row.name ?? ""),
      status: String(row.status ?? ""),
      banker_id: bankerId,
      banker_email: bankerId ? emailMap.get(bankerId) ?? null : null,
      player_count: countMap.get(id) ?? 0,
      bank_amount_cents: norm?.current_bank_cents ?? 0,
      created_at: row.created_at ?? null,
    };
  });

  return NextResponse.json({ rooms: enriched });
}

/** DELETE /api/admin/celo/rooms — body: { roomId }; force-close, refunds, cancelled. */
export async function DELETE(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const roomId = (body as { roomId?: string }).roomId;
  if (!roomId || typeof roomId !== "string") {
    return NextResponse.json({ message: "roomId required" }, { status: 400 });
  }

  const { data: roomRows, error: roomErr } = await supabase
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .limit(1);
  const room = celoFirstRow(roomRows);
  if (roomErr || !room) {
    return NextResponse.json({ message: "Room not found" }, { status: 404 });
  }

  const raw = room as Record<string, unknown>;
  const normalized = normalizeCeloRoomRow(raw);
  if (!normalized) {
    return NextResponse.json({ message: "Room not found" }, { status: 404 });
  }

  const status = String(normalized.status ?? "");
  if (status === "cancelled" || status === "completed") {
    return NextResponse.json({ ok: true, skipped: true, message: "Room already closed" });
  }

  const bankerId = String(raw.banker_id ?? normalized.banker_id ?? "");

  const { data: roundRows } = await supabase.from("celo_rounds").select("id").eq("room_id", roomId);
  for (const rr of roundRows ?? []) {
    const rid = String((rr as { id: string }).id);
    await settleCeloOpenSideBets(supabase, rid, roomId);
  }

  await supabase.from("celo_rounds").delete().eq("room_id", roomId);

  const { data: playerRows, error: playersErr } = await supabase
    .from("celo_room_players")
    .select("user_id, role, entry_sc, bet_cents")
    .eq("room_id", roomId);

  if (playersErr) {
    return NextResponse.json({ message: playersErr.message }, { status: 500 });
  }

  let refundsIssued = 0;
  for (const p of (playerRows ?? []) as Array<{
    user_id: string;
    role: string;
    entry_sc?: number | null;
    bet_cents?: number | null;
  }>) {
    if (p.role !== "player") continue;
    const cents = celoPlayerStakeCents(p);
    if (cents <= 0) continue;
    const ref = celoPlayerStakeRefundReference(roomId, p.user_id);
    const result = await walletLedgerGameWinIdempotent(p.user_id, cents, ref);
    if (!result.success) {
      return NextResponse.json(
        { message: result.message ?? "Player refund failed", details: p.user_id },
        { status: 500 }
      );
    }
    if (!("skipped" in result && result.skipped)) refundsIssued += 1;
  }

  const bankCents = normalized.current_bank_cents ?? 0;
  if (bankCents > 0 && bankerId) {
    const bankRef = celoBankRefundReference(roomId);
    const bankResult = await walletLedgerGameWinIdempotent(bankerId, bankCents, bankRef);
    if (!bankResult.success) {
      return NextResponse.json(
        { message: bankResult.message ?? "Bank refund failed" },
        { status: 500 }
      );
    }
  }

  const { error: delPlayersErr } = await supabase.from("celo_room_players").delete().eq("room_id", roomId);
  if (delPlayersErr) {
    return NextResponse.json({ message: delPlayersErr.message ?? "Failed to clear players" }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("celo_rooms")
    .update(
      mergeCeloRoomUpdate(0, {
        status: "cancelled",
        last_activity: now,
      })
    )
    .eq("id", roomId);

  if (updErr) {
    return NextResponse.json({ message: updErr.message ?? "Failed to update room" }, { status: 500 });
  }

  await supabase.from("celo_audit_log").insert({
    room_id: roomId,
    user_id: null,
    action: "room_admin_force_closed",
    details: {
      player_refunds: refundsIssued,
      bank_refunded_cents: bankCents > 0 && bankerId ? bankCents : 0,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Room force-closed and refunds issued",
    player_refunds: refundsIssued,
    bank_refunded_cents: bankCents > 0 && bankerId ? bankCents : 0,
  });
}
