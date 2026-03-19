import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import {
  getAdvertiserByUserId,
  createGarmonAd,
  checkAdContentModeration,
} from "@/lib/garmon-ads-db";

const TITLE_MAX = 50;
const DESC_MAX = 200;

/** POST /api/ads/create — advertiser creates a new ad (status pending for review). */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: {
    title: string;
    description?: string;
    ad_type: "video" | "banner" | "social" | "product";
    media_url?: string;
    thumbnail_url?: string;
    destination_url?: string;
    instagram_url?: string;
    tiktok_url?: string;
    youtube_url?: string;
    twitter_url?: string;
    facebook_url?: string;
    twitch_url?: string;
    total_budget?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const {
    title,
    description,
    ad_type,
    media_url,
    thumbnail_url,
    destination_url,
    instagram_url,
    tiktok_url,
    youtube_url,
    twitter_url,
    facebook_url,
    twitch_url,
    total_budget = 0,
  } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ message: "title is required" }, { status: 400 });
  }
  if (title.length > TITLE_MAX) {
    return NextResponse.json({ message: `title max ${TITLE_MAX} characters` }, { status: 400 });
  }
  const desc = (description ?? "").trim();
  if (desc.length > DESC_MAX) {
    return NextResponse.json({ message: `description max ${DESC_MAX} characters` }, { status: 400 });
  }
  const validTypes = ["video", "banner", "social", "product"];
  if (!ad_type || !validTypes.includes(ad_type)) {
    return NextResponse.json({ message: "ad_type must be video, banner, social, or product" }, { status: 400 });
  }
  if (typeof total_budget !== "number" || total_budget < 0) {
    return NextResponse.json({ message: "total_budget must be a non-negative number" }, { status: 400 });
  }

  const moderation = await checkAdContentModeration(title, desc);
  if (moderation.blocked) {
    return NextResponse.json(
      { message: moderation.reason ?? "Content not allowed" },
      { status: 400 }
    );
  }

  try {
    const advertiser = await getAdvertiserByUserId(userId);
    if (!advertiser) {
      return NextResponse.json(
        { message: "Create an advertiser profile first" },
        { status: 400 }
      );
    }

    const ad = await createGarmonAd({
      advertiser_id: advertiser.id,
      user_id: userId,
      title: title.trim(),
      description: desc || null,
      ad_type,
      media_url: media_url?.trim() || null,
      thumbnail_url: thumbnail_url?.trim() || null,
      destination_url: destination_url?.trim() || null,
      instagram_url: instagram_url?.trim() || null,
      tiktok_url: tiktok_url?.trim() || null,
      youtube_url: youtube_url?.trim() || null,
      twitter_url: twitter_url?.trim() || null,
      facebook_url: facebook_url?.trim() || null,
      twitch_url: twitch_url?.trim() || null,
      total_budget: Number(total_budget),
      remaining_budget: 0,
      status: "pending",
    });
    return NextResponse.json({ adId: ad.id, status: ad.status });
  } catch (e) {
    console.error("Ad create error:", e);
    return NextResponse.json({ message: "Failed to create ad" }, { status: 500 });
  }
}
