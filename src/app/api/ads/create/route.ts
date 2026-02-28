import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";

const BUCKET = "ads";

/** POST /api/ads/create — advertiser upload: create ad with title, description, budget, optional video/image. Auth required. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const supabase = createClient(url, serviceKey);

  let title = "";
  let description = "";
  let budget = 0;
  let videoUrl: string | null = null;
  let imageUrl: string | null = null;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    title = (formData.get("title") as string)?.trim() ?? "";
    description = (formData.get("description") as string)?.trim() ?? "";
    const budgetNum = formData.get("budget");
    budget = typeof budgetNum === "string" ? parseFloat(budgetNum) : Number(budgetNum);
    const videoFile = formData.get("video") as File | null;
    const imageFile = formData.get("image") as File | null;
    if (videoFile && videoFile instanceof File && videoFile.size > 0) {
      const path = `${userId}/${Date.now()}-${videoFile.name.replace(/\s/g, "_")}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, videoFile, { contentType: videoFile.type, upsert: false });
      if (!error) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        videoUrl = data.publicUrl;
      }
    }
    if (imageFile && imageFile instanceof File && imageFile.size > 0) {
      const path = `${userId}/${Date.now()}-${imageFile.name.replace(/\s/g, "_")}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, imageFile, { contentType: imageFile.type, upsert: false });
      if (!error) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        imageUrl = data.publicUrl;
      }
    }
  } else {
    const body = await request.json().catch(() => ({}));
    title = (body.title ?? "").trim();
    description = (body.description ?? "").trim();
    budget = Number(body.budget) || 0;
    videoUrl = typeof body.video_url === "string" ? body.video_url.trim() || null : null;
    imageUrl = typeof body.image_url === "string" ? body.image_url.trim() || null : null;
  }

  if (!title) {
    return NextResponse.json({ message: "Title is required" }, { status: 400 });
  }

  const mediaUrl = videoUrl ?? imageUrl;
  const insertRow: Record<string, unknown> = {
    title,
    description: description || "",
    type: videoUrl ? "video" : imageUrl ? "image" : "text",
    media_url: mediaUrl,
    status: "inactive",
    advertiser_price: 0,
    user_reward: 0,
    profit_amount: 0,
    duration_seconds: 5,
  };
  insertRow.user_id = userId;
  insertRow.budget = Math.max(0, budget);
  const { data: row, error } = await supabase
    .from("ads")
    .insert(insertRow)
    .select("id, title, description, media_url, budget, status, created_at")
    .single();

  if (error) {
    console.error("Ads create error:", error);
    return NextResponse.json({ message: error.message || "Failed to create ad" }, { status: 500 });
  }
  return NextResponse.json({ ad: row, message: "Ad created (pending approval)" });
}
