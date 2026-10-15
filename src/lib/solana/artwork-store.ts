import { getSupabaseAdmin } from "@/lib/supabase/client";

export const TOKEN_ART_BUCKET = "garmonpay-token-art";
const EXTENSIONS = ["png", "jpg", "webp", "json"] as const;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function isDraftId(value: string) {
  return /^[a-f0-9]{32}$/.test(value);
}

export function artworkObjectUrl(supabaseUrl: string, name: string) {
  const base = new URL(supabaseUrl);
  return `${base.origin}/storage/v1/object/public/${TOKEN_ART_BUCKET}/${name}`;
}

export function isStoredArtworkUrl(value: string, supabaseUrl: string) {
  try {
    const image = new URL(value);
    const base = new URL(supabaseUrl);
    return image.protocol === "https:" && image.host === base.host && image.pathname.startsWith(`/storage/v1/object/public/${TOKEN_ART_BUCKET}/`);
  } catch {
    return false;
  }
}

async function bucket() {
  const admin = getSupabaseAdmin();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!admin || !supabaseUrl) throw new Error("Artwork storage is not configured.");
  const existing = await admin.storage.getBucket(TOKEN_ART_BUCKET);
  if (existing.error && !/not found/i.test(existing.error.message)) throw new Error("Artwork storage is unavailable.");
  if (!existing.data) {
    const created = await admin.storage.createBucket(TOKEN_ART_BUCKET, {
      public: true,
      fileSizeLimit: 1_500_000,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "application/json"],
    });
    if (created.error && !/already exists/i.test(created.error.message)) throw new Error("Artwork storage is unavailable.");
  }
  return { admin, supabaseUrl };
}

export async function saveTokenArtwork(input: {
  draftId: string;
  image: Buffer;
  extension: "png" | "jpg" | "webp";
  contentType: string;
  metadata: { name: string; symbol: string; description: string; keywords: string };
}) {
  if (!isDraftId(input.draftId)) throw new Error("Artwork draft is invalid.");
  const { admin, supabaseUrl } = await bucket();
  const imageName = `${input.draftId}.${input.extension}`;
  const metaName = `${input.draftId}.json`;
  await admin.storage.from(TOKEN_ART_BUCKET).remove(EXTENSIONS.map(extension => `${input.draftId}.${extension}`));
  const imageUrl = artworkObjectUrl(supabaseUrl, imageName);
  const uploaded = await admin.storage.from(TOKEN_ART_BUCKET).upload(imageName, input.image, { contentType: input.contentType, upsert: false });
  if (uploaded.error) throw new Error("Artwork could not be saved.");
  const metadata = {
    name: input.metadata.name,
    symbol: input.metadata.symbol,
    description: input.metadata.description,
    image: imageUrl,
    properties: { keywords: input.metadata.keywords },
  };
  const meta = await admin.storage.from(TOKEN_ART_BUCKET).upload(metaName, Buffer.from(JSON.stringify(metadata)), { contentType: "application/json", upsert: false });
  if (meta.error) {
    await admin.storage.from(TOKEN_ART_BUCKET).remove([imageName]);
    throw new Error("Artwork details could not be saved.");
  }
  void sweepAbandoned(admin);
  return { imageUrl, metadataUrl: artworkObjectUrl(supabaseUrl, metaName), immutable: false as const, host: "garmonpay-storage" as const };
}

export async function writeLaunchMetadata(draftId: string, metadata: {
  name: string;
  symbol: string;
  description: string;
  imageUrl?: string;
  website?: string;
  social?: string;
}) {
  if (!isDraftId(draftId)) throw new Error("Artwork draft is invalid.");
  const { admin, supabaseUrl } = await bucket();
  if (metadata.imageUrl && !isStoredArtworkUrl(metadata.imageUrl, supabaseUrl)) throw new Error("Image address is not stored artwork.");
  const body = {
    name: metadata.name,
    symbol: metadata.symbol,
    description: metadata.description,
    image: metadata.imageUrl || undefined,
    external_url: metadata.website || undefined,
    extensions: metadata.social ? { social: metadata.social } : undefined,
  };
  const uploaded = await admin.storage.from(TOKEN_ART_BUCKET).upload(`${draftId}.json`, Buffer.from(JSON.stringify(body)), { contentType: "application/json", upsert: true });
  if (uploaded.error) throw new Error("Token metadata could not be saved.");
  return { metadataUrl: artworkObjectUrl(supabaseUrl, `${draftId}.json`) };
}

export async function readLaunchMetadata(draftId: string) {
  if (!isDraftId(draftId)) return null;
  const { admin } = await bucket();
  const file = await admin.storage.from(TOKEN_ART_BUCKET).download(`${draftId}.json`);
  if (file.error || !file.data) return null;
  const parsed = JSON.parse(await file.data.text()) as { name?: string; symbol?: string; description?: string; image?: string; external_url?: string };
  if (typeof parsed.name !== "string" || typeof parsed.symbol !== "string") return null;
  return parsed;
}

export async function readTokenArtwork(draftId: string) {
  if (!isDraftId(draftId)) return null;
  const { admin, supabaseUrl } = await bucket();
  const file = await admin.storage.from(TOKEN_ART_BUCKET).download(`${draftId}.json`);
  if (file.error || !file.data) return null;
  const parsed = JSON.parse(await file.data.text()) as { name?: string; symbol?: string; image?: string };
  if (typeof parsed.image !== "string" || !isStoredArtworkUrl(parsed.image, supabaseUrl)) return null;
  return { imageUrl: parsed.image, metadataUrl: artworkObjectUrl(supabaseUrl, `${draftId}.json`), name: parsed.name ?? "", symbol: parsed.symbol ?? "" };
}

export async function deleteTokenArtwork(draftId: string) {
  if (!isDraftId(draftId)) throw new Error("Artwork draft is invalid.");
  const { admin } = await bucket();
  await admin.storage.from(TOKEN_ART_BUCKET).remove(EXTENSIONS.map(extension => `${draftId}.${extension}`));
}

async function sweepAbandoned(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const listed = await admin.storage.from(TOKEN_ART_BUCKET).list("", { limit: 100, sortBy: { column: "created_at", order: "asc" } });
  const cutoff = Date.now() - RETENTION_MS;
  const stale = (listed.data ?? []).filter(file => file.created_at && Date.parse(file.created_at) < cutoff).slice(0, 10).map(file => file.name);
  if (stale.length) await admin.storage.from(TOKEN_ART_BUCKET).remove(stale);
}
