import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { adminForceCloseCeloRoom } from "@/lib/celo-admin-force-close-room";
import { CELO_LOBBY_STATUSES } from "@/lib/celo-room-constants";
import { createAdminClient } from "@/lib/supabase";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";

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
      current_bank_sc: norm?.current_bank_sc ?? 0,
      created_at: row.created_at ?? null,
    };
  });

  return NextResponse.json({ rooms: enriched });
}

/** POST /api/admin/celo/rooms — body: { action: "close_all_lobby" }; force-close every waiting|active|rolling room. */
export async function POST(request: Request) {
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

  const action = (body as { action?: string }).action;
  if (action !== "close_all_lobby") {
    return NextResponse.json({ message: 'Expected { "action": "close_all_lobby" }' }, { status: 400 });
  }

  const { data: openRows, error: listErr } = await supabase
    .from("celo_rooms")
    .select("id")
    .in("status", [...CELO_LOBBY_STATUSES]);

  if (listErr) {
    return NextResponse.json({ message: listErr.message }, { status: 500 });
  }

  const roomIds = (openRows ?? []).map((r) => String((r as { id: string }).id)).filter(Boolean);

  const results: Array<{
    roomId: string;
    ok: boolean;
    skipped?: boolean;
    player_refunds?: number;
    bank_refunded_cents?: number;
    message?: string;
    details?: unknown;
  }> = [];

  for (const roomId of roomIds) {
    const res = await adminForceCloseCeloRoom(supabase, roomId);
    if (res.ok) {
      results.push({
        roomId,
        ok: true,
        skipped: res.skipped === true,
        player_refunds: res.player_refunds,
        bank_refunded_cents: res.bank_refunded_cents,
      });
    } else {
      results.push({ roomId, ok: false, message: res.message, details: res.details });
    }
  }

  const failed = results.filter((r) => !r.ok);
  const closed = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.ok && r.skipped).length;

  return NextResponse.json({
    ok: failed.length === 0,
    total: roomIds.length,
    closed,
    skipped,
    failed: failed.length,
    results,
  });
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

  const res = await adminForceCloseCeloRoom(supabase, roomId);
  if (!res.ok) {
    if (res.message === "Room not found") {
      return NextResponse.json({ message: res.message }, { status: 404 });
    }
    return NextResponse.json({ message: res.message, details: res.details }, { status: 500 });
  }

  if (res.skipped) {
    return NextResponse.json({ ok: true, skipped: true, message: "Room already closed" });
  }

  return NextResponse.json({
    ok: true,
    message: "Room force-closed and refunds issued",
    player_refunds: res.player_refunds,
    bank_refunded_cents: res.bank_refunded_cents,
  });
}
