import { NextResponse } from "next/server";
import { getCeloUserId, admin } from "@/lib/celo-server";

const MAX_MESSAGE_LEN = 500;

async function requireSeated(
  supabase: ReturnType<typeof admin>,
  roomId: string,
  userId: string
): Promise<{ ok: true } | { error: string; status: number }> {
  const { data: room, error: roomErr } = await supabase
    .from("celo_rooms")
    .select("id")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr || !room) {
    return { error: "Room not found", status: 404 };
  }

  const { data: membership } = await supabase
    .from("celo_room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return { error: "Join the table to use chat", status: 403 };
  }

  return { ok: true };
}

function normalizeMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t.length) return null;
  if (t.length > MAX_MESSAGE_LEN) return null;
  return t;
}

/** GET — recent table chat (seated members only). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCeloUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: roomId } = await params;
    if (!roomId) {
      return NextResponse.json({ error: "Missing room id" }, { status: 400 });
    }

    const supabase = admin();
    const gate = await requireSeated(supabase, roomId, userId);
    if (!("ok" in gate)) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { data: rows, error } = await supabase
      .from("celo_chat")
      .select("id, user_id, message, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const messages = [...(rows ?? [])].reverse();

    return NextResponse.json({ messages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST — post a chat line (seated members only). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCeloUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: roomId } = await params;
    if (!roomId) {
      return NextResponse.json({ error: "Missing room id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const message = normalizeMessage((body as { message?: unknown }).message);
    if (!message) {
      return NextResponse.json(
        { error: `Message must be 1–${MAX_MESSAGE_LEN} characters` },
        { status: 400 }
      );
    }

    const supabase = admin();
    const gate = await requireSeated(supabase, roomId, userId);
    if (!("ok" in gate)) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { data: inserted, error: insErr } = await supabase
      .from("celo_chat")
      .insert({ room_id: roomId, user_id: userId, message })
      .select("id, user_id, message, created_at")
      .single();

    if (insErr || !inserted) {
      return NextResponse.json({ error: insErr?.message ?? "Failed to send" }, { status: 500 });
    }

    await supabase
      .from("celo_rooms")
      .update({ last_activity: new Date().toISOString() })
      .eq("id", roomId);

    return NextResponse.json({ ok: true, message: inserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
