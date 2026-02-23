import { NextResponse } from "next/server";
import { listTournaments } from "@/lib/tournament-db";

/** GET /api/tournaments — list active and upcoming tournaments. */
export async function GET(_request: Request) {
  try {
    const list = await listTournaments(["active", "upcoming"]);
    return NextResponse.json({ tournaments: list });
  } catch (e) {
    console.error("Tournaments list error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}
