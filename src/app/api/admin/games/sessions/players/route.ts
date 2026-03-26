import { NextResponse } from "next/server";
import { isGameAdmin } from "@/lib/admin-auth";
import { listPlayers } from "@/lib/escape-room-db";

/** GET /api/admin/games/sessions/players */
export async function GET(req: Request) {
  if (!(await isGameAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const players = await listPlayers(5000);
    return NextResponse.json({ players });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch players";
    return NextResponse.json({ message }, { status: 500 });
  }
}
