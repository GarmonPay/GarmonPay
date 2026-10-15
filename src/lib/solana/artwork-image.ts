import sharp from "sharp";

const TYPES = ["png", "jpeg", "webp"] as const;
type ArtworkFormat = (typeof TYPES)[number];
function artworkFormat(value: string | undefined): ArtworkFormat | null {
  return TYPES.find(type => type === value) ?? null;
}

export async function inspectArtwork(bytes: Uint8Array) {
  if (bytes.byteLength < 32 || bytes.byteLength > 1_500_000) throw new Error("Use a PNG, JPEG, or WebP image under 1.5 MB.");
  let meta: { format?: string; width?: number; height?: number };
  try {
    meta = await sharp(bytes, { failOn: "error", limitInputPixels: 2048 * 2048 }).metadata();
  } catch {
    throw new Error("That file is not a readable PNG, JPEG, or WebP image.");
  }
  const format = artworkFormat(meta.format);
  if (!format || !meta.width || !meta.height) throw new Error("Use a PNG, JPEG, or WebP image.");
  if (meta.width < 64 || meta.height < 64 || meta.width > 2048 || meta.height > 2048) {
    throw new Error("Artwork must be between 64 and 2048 pixels on each side.");
  }
  const cleaned = await sharp(bytes, { failOn: "error", limitInputPixels: 2048 * 2048 }).rotate().toFormat(format).toBuffer();
  if (cleaned.byteLength > 1_500_000) throw new Error("Use a PNG, JPEG, or WebP image under 1.5 MB.");
  const extension = (format === "jpeg" ? "jpg" : format) as "png" | "jpg" | "webp";
  return { bytes: cleaned, format, extension, width: meta.width, height: meta.height, contentType: `image/${format}` as const };
}
