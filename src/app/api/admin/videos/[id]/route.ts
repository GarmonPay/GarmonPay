import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import {
  parseBudgetGpc,
  parseOptionalUrl,
  parseTargetDemo,
  parseTitle,
  parseVideoUrl,
} from "@/lib/creator-videos-fields";

type RouteCtx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/videos/[id] — update editable video fields (admin only). */
export async function PATCH(request: Request, ctx: RouteCtx) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id: videoId } = await ctx.params;
  if (!videoId?.trim()) {
    return NextResponse.json({ message: "Video id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("creator_videos")
    .select("id, spent_gpc")
    .eq("id", videoId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ message: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ message: "Video not found" }, { status: 404 });
  }

  const title = parseTitle(body.title);
  const videoUrl = parseVideoUrl(body.videoUrl ?? body.video_url);
  const thumbnailRaw = body.thumbnailUrl ?? body.thumbnail_url;
  const budgetGpc = parseBudgetGpc(body.budgetGpc ?? body.budget_gpc);
  const targetDemo = parseTargetDemo(body.targetDemo ?? body.target_demo);

  if (!title) {
    return NextResponse.json({ message: "title required" }, { status: 400 });
  }
  if (!videoUrl) {
    return NextResponse.json({ message: "videoUrl must be a valid http(s) URL" }, { status: 400 });
  }
  if (thumbnailRaw != null && thumbnailRaw !== "" && !parseOptionalUrl(thumbnailRaw)) {
    return NextResponse.json({ message: "thumbnailUrl must be a valid http(s) URL" }, { status: 400 });
  }
  if (!Number.isFinite(budgetGpc) || budgetGpc < 10) {
    return NextResponse.json({ message: "budgetGpc must be at least 10" }, { status: 400 });
  }

  const spent = Math.floor(Number(existing.spent_gpc ?? 0));
  if (budgetGpc < spent) {
    return NextResponse.json(
      { message: `budgetGpc cannot be below spent GPC (${spent})` },
      { status: 400 }
    );
  }

  const thumbnailUrl =
    thumbnailRaw == null || thumbnailRaw === "" ? null : parseOptionalUrl(thumbnailRaw);

  const { data, error } = await supabase
    .from("creator_videos")
    .update({
      title,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      budget_gpc: budgetGpc,
      target_demo: targetDemo,
    })
    .eq("id", videoId)
    .select(
      `
      *,
      creator:users!creator_videos_creator_id_fkey(email, username)
    `
    )
    .single();

  if (error) {
    console.error("[admin/videos/[id] PATCH]", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, video: data });
}
