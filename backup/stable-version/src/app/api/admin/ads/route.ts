import { NextResponse } from "next/server";
import { findUserById, hasAdminAccess } from "@/lib/auth-store";
import { createAd, listAllAds, updateAd } from "@/lib/ads-db";
import { adRowToApi } from "@/lib/ads-mapper";
import { createAdminClient } from "@/lib/supabase";

const AD_TYPES = ["video", "image", "text", "link"] as const;

function isAdmin(request: Request): boolean {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return false;
  const user = findUserById(adminId);
  return !!(user && hasAdminAccess(user));
}

/** GET: List all ads (admin). */
export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Database not configured" }, { status: 503 });
  }
  try {
    const rows = await listAllAds();
    const ads = rows.map(adRowToApi);
    return NextResponse.json({ ads });
  } catch (e) {
    console.error("Admin list ads error:", e);
    return NextResponse.json({ message: "Failed to list ads" }, { status: 500 });
  }
}

/** POST: Create ad (admin). Body: title, description?, type, media_url?, advertiser_price, user_reward, duration_seconds, status? */
export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Database not configured" }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const type = AD_TYPES.includes(body.type as (typeof AD_TYPES)[number]) ? (body.type as (typeof AD_TYPES)[number]) : null;
  const advertiserPrice = typeof body.advertiser_price === "number" ? Math.round(body.advertiser_price) : null;
  const userReward = typeof body.user_reward === "number" ? Math.round(body.user_reward) : null;
  const durationSeconds = typeof body.duration_seconds === "number" ? Math.max(1, Math.round(body.duration_seconds)) : null;

  if (!title || !type || advertiserPrice == null || advertiserPrice < 0 || userReward == null || userReward < 0 || durationSeconds == null) {
    return NextResponse.json(
      { message: "Missing or invalid: title, type, advertiser_price (>=0), user_reward (>=0), duration_seconds (>=1)" },
      { status: 400 }
    );
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  const mediaUrl = typeof body.media_url === "string" ? body.media_url.trim() || null : null;
  const status = body.status === "inactive" ? "inactive" : "active";

  try {
    const ad = await createAd({
      title,
      description: description || undefined,
      type,
      media_url: mediaUrl ?? undefined,
      advertiser_price: advertiserPrice,
      user_reward: userReward,
      duration_seconds: durationSeconds,
      status,
    });
    return NextResponse.json({ ad: adRowToApi(ad) });
  } catch (e) {
    console.error("Admin create ad error:", e);
    return NextResponse.json({ message: "Failed to create ad" }, { status: 500 });
  }
}

/** PATCH: Update ad (admin). Body: id, and any of status, title, description, type, media_url, advertiser_price, user_reward, duration_seconds */
export async function PATCH(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Database not configured" }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ message: "id required" }, { status: 400 });
  const updates: Parameters<typeof updateAd>[1] = {};
  if (body.status === "active" || body.status === "inactive") updates.status = body.status;
  if (typeof body.title === "string") updates.title = body.title.trim();
  if (typeof body.description === "string") updates.description = body.description.trim();
  if (AD_TYPES.includes(body.type as (typeof AD_TYPES)[number])) updates.type = body.type as (typeof AD_TYPES)[number];
  if (typeof body.media_url === "string") updates.media_url = body.media_url.trim() || null;
  if (typeof body.advertiser_price === "number") updates.advertiser_price = Math.round(body.advertiser_price);
  if (typeof body.user_reward === "number") updates.user_reward = Math.round(body.user_reward);
  if (typeof body.duration_seconds === "number") updates.duration_seconds = Math.max(1, Math.round(body.duration_seconds));
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: "No updates" }, { status: 400 });
  }
  try {
    const ad = await updateAd(id, updates);
    return NextResponse.json({ ad: adRowToApi(ad) });
  } catch (e) {
    console.error("Admin update ad error:", e);
    return NextResponse.json({ message: "Failed to update ad" }, { status: 500 });
  }
}
