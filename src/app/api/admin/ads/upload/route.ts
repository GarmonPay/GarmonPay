import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { uploadAdsAsset } from "@/lib/ads-storage";

/** POST: Upload ad media (video or image). Admin only. Returns { url }. */
export async function POST(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Storage not configured" }, { status: 503 });
  }
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ message: "No file" }, { status: 400 });
  }
  const kind = file.type.startsWith("video/") ? "video" : "image";
  try {
    const url = await uploadAdsAsset({
      supabase,
      userId: auth.context.userId,
      file,
      kind,
    });
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ message }, { status: 400 });
  }
}
