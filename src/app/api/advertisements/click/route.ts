import { NextResponse } from "next/server";
import { incrementClicks } from "@/lib/advertisements-db";

/**
 * POST /api/advertisements/click
 * Body: { id: string }. Increments click count for the ad. Public (no auth).
 */
export async function POST(request: Request) {
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : null;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  try {
    await incrementClicks(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Click increment error:", e);
    return NextResponse.json({ error: "Failed to record click" }, { status: 500 });
  }
}
