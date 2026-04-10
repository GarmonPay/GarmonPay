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
