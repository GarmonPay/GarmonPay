import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { validateEntry } from "@/lib/celo-engine";
import { mergeCeloRoomUpdate, normalizeCeloRoomRow } from "@/lib/celo-room-schema";

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: { room_id?: unknown; new_bank_sc?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.room_id === "string" ? body.room_id : null;
  const newBank = Math.floor(Number(body.new_bank_sc));

  if (!roomId || !Number.isFinite(newBank)) {
    return NextResponse.json({ message: "room_id and new_bank_sc required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: roomRaw, error } = await supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();
  if (error || !roomRaw) return NextResponse.json({ message: "Room not found" }, { status: 404 });

  const room = roomRaw as Record<string, unknown>;
  if (String(room.banker_id) !== userId) {
    return NextResponse.json({ message: "Only the banker can lower the bank" }, { status: 403 });
  }
  if (!room.last_round_was_celo) {
    return NextResponse.json({ message: "Lower bank is only available after a C-Lo roll" }, { status: 400 });
  }

  const bankerCeloAt = room.banker_celo_at ? new Date(String(room.banker_celo_at)).getTime() : 0;
  if (!bankerCeloAt || Date.now() - bankerCeloAt > 60_000) {
    return NextResponse.json({ message: "Lower bank window has expired" }, { status: 400 });
  }

  const minimum = Math.floor(Number(room.minimum_entry_sc ?? 500));
  const current = Math.floor(Number(room.current_bank_sc ?? 0));

  const v = validateEntry(newBank, minimum);
  if (!v.valid) return NextResponse.json({ message: v.error }, { status: 400 });

  if (newBank >= current) {
    return NextResponse.json({ message: "New bank must be less than current bank" }, { status: 400 });
  }

  const { data: updated, error: uErr } = await supabase
    .from("celo_rooms")
    .update(
      mergeCeloRoomUpdate(newBank, {
        last_round_was_celo: false,
        last_activity: new Date().toISOString(),
      })
    )
    .eq("id", roomId)
    .select("*")
    .single();

  if (uErr || !updated) {
    return NextResponse.json({ message: uErr?.message ?? "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, room: normalizeCeloRoomRow(updated as Record<string, unknown>) });
}
