import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

const BUCKET = "ads";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "video/mp4",
]);
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "mp4"]);

/**
 * POST: Upload advertisement file (banner image or video). Admin only.
 * Accepts: jpg, png, mp4. Returns { url } (public URL for file_url in advertisements table).
 */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
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
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { message: "Only jpg, png, mp4 allowed" },
      { status: 400 }
    );
  }
  const mime = file.type?.toLowerCase();
  if (mime && !ALLOWED_TYPES.has(mime)) {
    const fallback: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      mp4: "video/mp4",
    };
    if (!fallback[ext]) {
      return NextResponse.json(
        { message: "Invalid file type. Use jpg, png, or mp4." },
        { status: 400 }
      );
    }
  }
  const contentType = ALLOWED_TYPES.has(mime) ? mime : (ext === "mp4" ? "video/mp4" : ext === "png" ? "image/png" : "image/jpeg");
  const path = `ads/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType,
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}
