import { NextResponse } from "next/server";
import { recordBannerImpression } from "@/lib/banners-db";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/banners/impression — record one impression. Body: { bannerId }. */
export async function POST(request: Request) {
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: { bannerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const bannerId = body.bannerId;
  if (!bannerId || typeof bannerId !== "string") {
    return NextResponse.json({ message: "bannerId required" }, { status: 400 });
  }
  try {
    await recordBannerImpression(bannerId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Banner impression error:", e);
    return NextResponse.json({ message: "Failed" }, { status: 500 });
  }
}
