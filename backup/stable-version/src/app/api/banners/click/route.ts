import { NextResponse } from "next/server";
import { recordBannerClick } from "@/lib/banners-db";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/banners/click — record click and return target_url for redirect. Body: { bannerId }. */
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
    const result = await recordBannerClick(bannerId);
    if (!result) return NextResponse.json({ message: "Banner not found" }, { status: 404 });
    return NextResponse.json({ target_url: result.target_url });
  } catch (e) {
    console.error("Banner click error:", e);
    return NextResponse.json({ message: "Failed" }, { status: 500 });
  }
}
