import type { SupabaseClient } from "@supabase/supabase-js";

export const ADS_BUCKET = "ads";

let adsBucketReady = false;

const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

function getFileExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.trim().toLowerCase() ?? "bin";
  return ext.replace(/[^a-z0-9]/g, "") || "bin";
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function ensureAdsBucket(supabase: SupabaseClient): Promise<void> {
  if (adsBucketReady) return;

  const { data: existing } = await supabase.storage.getBucket(ADS_BUCKET);
  if (!existing) {
    const { error } = await supabase.storage.createBucket(ADS_BUCKET, {
      public: true,
      fileSizeLimit: 100 * 1024 * 1024,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    });
    if (error && !error.message.toLowerCase().includes("already")) {
      throw new Error(error.message);
    }
  }

  adsBucketReady = true;
}

export async function uploadAdsAsset(params: {
  supabase: SupabaseClient;
  userId: string;
  file: File;
  kind: "video" | "image";
}): Promise<string> {
  await ensureAdsBucket(params.supabase);

  const ext = getFileExtension(params.file.name);
  const path = `${params.userId}/${Date.now()}-${params.kind}-${randomSuffix()}.${ext}`;
  const { error } = await params.supabase.storage.from(ADS_BUCKET).upload(path, params.file, {
    contentType: params.file.type || undefined,
    upsert: false,
  });
  if (error) {
    throw new Error(error.message);
  }

  const { data } = params.supabase.storage.from(ADS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error("Upload succeeded but public URL is unavailable");
  }
  return data.publicUrl;
}
