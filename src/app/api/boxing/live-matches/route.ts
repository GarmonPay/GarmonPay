import { NextResponse } from "next/server";
import { listLiveBoxingMatches } from "@/lib/boxing-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matches = await listLiveBoxingMatches();
    return NextResponse.json({ matches: matches ?? [] });
  } catch {
    return NextResponse.json({ matches: [] });
  }
}
