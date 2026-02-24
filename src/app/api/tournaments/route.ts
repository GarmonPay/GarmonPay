import { NextResponse } from "next/server";
import { listTournaments } from "@/lib/tournament-db";
import { getTournaments } from "@/lib/tournaments";

/** GET /api/tournaments — list active and upcoming tournaments. */
export async function GET(_request: Request) {
  try {
    const list = await listTournaments(["active", "upcoming"]);
    return NextResponse.json({ tournaments: list });
  } catch (e) {
    console.error("Tournaments list error:", e);
    try {
      const all = await getTournaments();
      const tournaments = (all as { id: string; name: string; entry_fee?: number; prize_pool?: number; start_date?: string; end_date?: string; status?: string }[])
        .filter((t) => t.status === "active" || t.status === "upcoming")
        .map((t) => ({
          id: t.id,
          name: t.name,
          entry_fee: Number(t.entry_fee) ?? 0,
          prize_pool: Number(t.prize_pool) ?? 0,
          start_date: t.start_date ?? "",
          end_date: t.end_date ?? "",
          status: t.status ?? "upcoming",
        }));
      return NextResponse.json({ tournaments });
    } catch (fallbackErr) {
      return NextResponse.json({ tournaments: [] });
    }
  }
}
