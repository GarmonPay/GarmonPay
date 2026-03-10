import { NextResponse } from "next/server";
import { incrementImpressions } from "@/lib/advertisements-db";

/**
 * POST /api/advertisements/impression
 * Body: { id: string }. Increments impression count for the ad. Public (no auth).
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
    await incrementImpressions(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Impression increment error:", e);
    return NextResponse.json({ error: "Failed to record impression" }, { status: 500 });
  }
}
