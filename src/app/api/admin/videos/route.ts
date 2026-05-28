import { NextResponse } from "next/server";
import { isAdmin, getAdminAuthUserId } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { sumWatchEarnGpcSince } from "@/lib/watch-earn";

/** GET /api/admin/videos?status=pending — list creator videos for moderation */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const status = new URL(request.url).searchParams.get("status");
  let query = supabase
    .from("creator_videos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let watchGpc24h = 0;
  let watchGpcAll = 0;
  try {
    watchGpc24h = await sumWatchEarnGpcSince(since24h);
    watchGpcAll = await sumWatchEarnGpcSince("1970-01-01T00:00:00.000Z");
  } catch (e) {
    console.error("[admin/videos] watch stats:", e);
  }

  return NextResponse.json({
    videos: data ?? [],
    watchEarnStats: { gpcLast24h: watchGpc24h, gpcAllTime: watchGpcAll },
  });
}

/** PATCH — approve | reject | flag | pause. Body: { videoId, action, reason? } */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const adminId = await getAdminAuthUserId(request);
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { videoId?: string; action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const videoId = body.videoId?.trim();
  const action = body.action?.trim().toLowerCase();
  if (!videoId || !action) {
    return NextResponse.json({ message: "videoId and action required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (action === "approve") {
    updates.status = "approved";
    updates.approved_at = new Date().toISOString();
    updates.approved_by = adminId;
  } else if (action === "reject") {
    updates.status = "rejected";
  } else if (action === "flag") {
    updates.status = "flagged";
  } else if (action === "pause") {
    updates.status = "paused";
  } else {
    return NextResponse.json(
      { message: "action must be approve, reject, flag, or pause" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("creator_videos").update(updates).eq("id", videoId);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, status: updates.status });
}
