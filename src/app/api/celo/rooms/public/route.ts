import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getPublicLobbyRoomsWithCleanup } from "@/lib/celo-public-rooms-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/celo/rooms/public
 * Canonical public lobby list (service role + stale cleanup). All clients should use this.
 */
export async function GET() {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  try {
    const { rooms, cleanup, queryCount } = await getPublicLobbyRoomsWithCleanup(admin);
    console.info("[celo-lobby-debug] GET /api/celo/rooms/public total rooms", queryCount);
    for (const row of rooms) {
      const r = row as Record<string, unknown>;
      console.info("[celo-lobby-debug] room row", {
        id: r.id,
        status: r.status,
        room_type: r.room_type,
        join_code: r.join_code ?? null,
        last_activity: r.last_activity,
      });
    }
    return NextResponse.json(
      { rooms, meta: { cleanup, queryCount } },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load rooms";
    console.error("[celo/rooms/public]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
