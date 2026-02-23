import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { createBanner, listBannersByOwner } from "@/lib/banners-db";

const BUCKET = "ad-media";
const BANNER_PREFIX = "banners";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_URL_PROTOCOLS = ["https:"];

function isValidTargetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_URL_PROTOCOLS.includes(u.protocol) && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/** GET /api/banners — list current user's banners. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  try {
    const banners = await listBannersByOwner(userId);
    return NextResponse.json({ banners });
  } catch (e) {
    console.error("List banners error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}

/** POST /api/banners — create banner (upload image + metadata). */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const title = (formData.get("title") as string)?.trim() ?? "";
  const targetUrl = (formData.get("target_url") as string)?.trim() ?? "";

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ message: "Image file required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ message: "Invalid image type. Use JPEG, PNG, GIF, or WebP." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ message: "Image too large. Max 2MB." }, { status: 400 });
  }
  if (!targetUrl || !isValidTargetUrl(targetUrl)) {
    return NextResponse.json({ message: "Valid HTTPS target URL required" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${BANNER_PREFIX}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ message: uploadError.message || "Upload failed" }, { status: 400 });
  }
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const imageUrl = urlData.publicUrl;

  try {
    const banner = await createBanner({
      owner_user_id: userId,
      title: title || "Banner",
      image_url: imageUrl,
      target_url: targetUrl,
      type: "advertiser",
    });
    return NextResponse.json({ banner });
  } catch (e) {
    console.error("Create banner error:", e);
    return NextResponse.json({ message: "Failed to save banner" }, { status: 500 });
  }
}
