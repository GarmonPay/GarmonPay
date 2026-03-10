import { NextResponse } from "next/server";
import { listActiveByPlacement, type AdPlacement } from "@/lib/advertisements-db";

const PLACEMENTS: AdPlacement[] = ["homepage", "dashboard", "fight_arena"];

/**
 * GET /api/advertisements?placement=homepage|dashboard|fight_arena
 * Returns active ads for the given placement (for AdDisplay). Public, cached.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placement = searchParams.get("placement") as AdPlacement | null;
  if (!placement || !PLACEMENTS.includes(placement)) {
    return NextResponse.json(
      { error: "placement required: homepage | dashboard | fight_arena" },
      { status: 400 }
    );
  }
  try {
    const ads = await listActiveByPlacement(placement);
    return NextResponse.json(
      { ads },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (e) {
    console.error("Advertisements list error:", e);
    return NextResponse.json({ ads: [] }, { status: 200 });
  }
}
