import { NextResponse } from "next/server";
import { listBoxingTournaments } from "@/lib/boxing-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tournaments = await listBoxingTournaments();
    return NextResponse.json({ tournaments });
  } catch {
    return NextResponse.json({ tournaments: [] });
  }
}
