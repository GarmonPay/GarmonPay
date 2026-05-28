import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import type { TargetDemo } from "@/lib/watch-earn";

const URL_RE = /^https?:\/\/.+/i;

/** GET — creator's own videos */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("creator_videos")
    .select("*")
    .eq("creator_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ videos: data ?? [] });
}

/** POST — submit video for moderation */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: {
    title?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    budgetGpc?: number;
    targetDemo?: TargetDemo;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  const thumbnailUrl =
    typeof body.thumbnailUrl === "string" && body.thumbnailUrl.trim()
      ? body.thumbnailUrl.trim()
      : null;
  const budgetGpc =
    typeof body.budgetGpc === "number"
      ? Math.floor(body.budgetGpc)
      : typeof body.budgetGpc === "string"
        ? Math.floor(Number(body.budgetGpc))
        : 0;

  if (!title) {
    return NextResponse.json({ message: "title required" }, { status: 400 });
  }
  if (!videoUrl || !URL_RE.test(videoUrl)) {
    return NextResponse.json({ message: "videoUrl must be a valid http(s) URL" }, { status: 400 });
  }
  if (!Number.isFinite(budgetGpc) || budgetGpc < 10) {
    return NextResponse.json({ message: "budgetGpc must be at least 10" }, { status: 400 });
  }

  const targetDemo =
    body.targetDemo && typeof body.targetDemo === "object" ? body.targetDemo : null;

  const { data, error } = await supabase
    .from("creator_videos")
    .insert({
      creator_id: userId,
      title,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      budget_gpc: budgetGpc,
      target_demo: targetDemo,
      status: "pending",
    })
    .select("id, status, title, created_at")
    .single();

  if (error) {
    console.error("[creator/videos] insert:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    video: data,
    message: "Video submitted for review.",
  });
}
