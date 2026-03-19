import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getAdvertiserByUserId } from "@/lib/garmon-ads-db";

const PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "facebook", "twitch"] as const;
const URL_PATTERNS: Record<string, RegExp> = {
  instagram: /^https?:\/\/(www\.)?instagram\.com\/[\w.]+\/?$/i,
  tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@?[\w.]+\/?$/i,
  youtube: /^https?:\/\/(www\.)?(youtube\.com\/@?[\w.-]+|youtu\.be\/[\w-]+)\/?$/i,
  twitter: /^https?:\/\/(www\.)?(twitter|x)\.com\/[\w.]+\/?$/i,
  facebook: /^https?:\/\/(www\.)?facebook\.com\/[\w.]+\/?$/i,
  twitch: /^https?:\/\/(www\.)?twitch\.tv\/[\w]+\/?$/i,
};

/** POST /api/ads/social/add — advertiser adds social media link. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { platform: string; profile_url: string; handle?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const { platform, profile_url, handle } = body;
  if (!platform || !PLATFORMS.includes(platform as (typeof PLATFORMS)[number])) {
    return NextResponse.json(
      { message: "platform must be one of: " + PLATFORMS.join(", ") },
      { status: 400 }
    );
  }
  const url = (profile_url ?? "").trim();
  if (!url) {
    return NextResponse.json({ message: "profile_url is required" }, { status: 400 });
  }
  const re = URL_PATTERNS[platform];
  if (re && !re.test(url)) {
    return NextResponse.json({ message: `Invalid ${platform} URL format` }, { status: 400 });
  }

  try {
    const advertiser = await getAdvertiserByUserId(userId);
    if (!advertiser) {
      return NextResponse.json({ message: "Advertiser profile required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("garmon_advertiser_social_links")
      .insert({
        advertiser_id: advertiser.id,
        platform,
        profile_url: url,
        handle: handle?.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ id: (data as { id: string }).id, link: data });
  } catch (e) {
    console.error("Social add error:", e);
    return NextResponse.json({ message: "Failed to add link" }, { status: 500 });
  }
}
