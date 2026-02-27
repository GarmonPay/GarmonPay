import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { uploadAdsAsset } from "@/lib/ads-storage";

function parseBudgetToCents(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    return Math.round(input * 100);
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number.parseFloat(input.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 100);
    }
  }
  return null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let title = "";
  let description = "";
  let budgetCents: number | null = null;
  let videoUrl = "";
  let imageUrl = "";
  let videoFile: File | null = null;
  let imageFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    title = readString(form.get("title"));
    description = readString(form.get("description"));
    budgetCents = parseBudgetToCents(form.get("budget"));
    videoUrl = readString(form.get("video_url"));
    imageUrl = readString(form.get("image_url"));
    const maybeVideo = form.get("video_file");
    const maybeImage = form.get("image_file");
    videoFile = maybeVideo instanceof File && maybeVideo.size > 0 ? maybeVideo : null;
    imageFile = maybeImage instanceof File && maybeImage.size > 0 ? maybeImage : null;
  } else {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }
    title = readString(body.title);
    description = readString(body.description);
    budgetCents = parseBudgetToCents(body.budget);
    videoUrl = readString(body.video_url);
    imageUrl = readString(body.image_url);
  }

  if (!title) {
    return NextResponse.json({ message: "Title is required" }, { status: 400 });
  }
  if (budgetCents == null || budgetCents <= 0) {
    return NextResponse.json({ message: "Budget must be greater than 0" }, { status: 400 });
  }

  try {
    if (videoFile) {
      videoUrl = await uploadAdsAsset({
        supabase,
        userId,
        file: videoFile,
        kind: "video",
      });
    }
    if (imageFile) {
      imageUrl = await uploadAdsAsset({
        supabase,
        userId,
        file: imageFile,
        kind: "image",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ message }, { status: 400 });
  }

  if (!videoUrl && !imageUrl) {
    return NextResponse.json({ message: "Upload at least one video or image" }, { status: 400 });
  }

  const type = videoUrl ? "video" : "image";
  const mediaUrl = videoUrl || imageUrl;

  const { data, error } = await supabase
    .from("ads")
    .insert({
      user_id: userId,
      title,
      description,
      video_url: videoUrl || null,
      image_url: imageUrl || null,
      budget: budgetCents,
      status: "pending",
      type,
      media_url: mediaUrl,
      advertiser_price: budgetCents,
      user_reward: 0,
      profit_amount: budgetCents,
      duration_seconds: 15,
    })
    .select("id, user_id, title, description, video_url, image_url, budget, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ad: data });
}
