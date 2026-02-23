import { NextResponse } from "next/server";
import { listActiveBanners } from "@/lib/banners-db";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/banners/rotator — list active banners for rotator (public). */
export async function GET() {
  try {
    if (!createAdminClient()) {
      console.error("Banners rotator: Supabase not configured");
      return NextResponse.json({ banners: [] });
    }
    const banners = await listActiveBanners();
    return NextResponse.json({ banners: banners.map((b) => ({ id: b.id, title: b.title, image_url: b.image_url, target_url: b.target_url })) });
  } catch (e) {
    console.error("Banners rotator error:", e);
    return NextResponse.json({ banners: [] });
  }
}
