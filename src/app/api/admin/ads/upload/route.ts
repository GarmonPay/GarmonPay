import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminAccess } from "@/lib/admin-auth";

const BUCKET = "ad-media";

/** POST: Upload ad media (video or image). Admin only. Returns { url }. */
export async function POST(request: Request) {
  const access = await requireAdminAccess(request);
  if (!access.ok) {
    return access.response;
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
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    console.error(error);
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}
