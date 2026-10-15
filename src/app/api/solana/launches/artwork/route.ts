import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { inspectArtwork } from "@/lib/solana/artwork-image";
import { deleteTokenArtwork, isDraftId, readTokenArtwork, saveTokenArtwork } from "@/lib/solana/artwork-store";
import { cookieOptions, json, trustedBrowserOrigin } from "@/lib/solana/http";
import { validateTokenMetadata } from "@/lib/solana/token-metadata";
import { rateLimitOr429 } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COOKIE = "gp-token-draft";

async function draftFromCookie() {
  const value = (await cookies()).get(COOKIE)?.value ?? "";
  return isDraftId(value) ? value : "";
}

async function rememberDraft(draftId: string) {
  (await cookies()).set(COOKIE, draftId, { ...cookieOptions, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
}

export async function GET() {
  const draftId = await draftFromCookie();
  if (!draftId) return json({ saved: false });
  try {
    const saved = await readTokenArtwork(draftId);
    return json({ saved: Boolean(saved), ...saved, immutable: false, host: saved ? "garmonpay-storage" : undefined });
  } catch {
    return json({ saved: false, error: "Saved artwork could not be read." }, 503);
  }
}

export async function POST(request: Request) {
  if (!trustedBrowserOrigin(request)) return json({ error: "Origin rejected", saved: false }, 403);
  const limited = rateLimitOr429(request, "solana-token-artwork", 8);
  if (limited) return limited;
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return json({ error: "Choose an image file.", saved: false }, 400);
    const checked = await inspectArtwork(new Uint8Array(await file.arrayBuffer()));
    const keywords = typeof form.get("keywords") === "string" ? String(form.get("keywords")).replace(/[<>\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) : "";
    const metadata = validateTokenMetadata({
      name: form.get("name"),
      symbol: form.get("symbol"),
      description: form.get("description"),
      website: "",
      social: "",
    });
    const draftId = (await draftFromCookie()) || randomBytes(16).toString("hex");
    const stored = await saveTokenArtwork({
      draftId,
      image: checked.bytes,
      extension: checked.extension,
      contentType: checked.contentType,
      metadata: { ...metadata, keywords },
    });
    await rememberDraft(draftId);
    return json({ saved: true, ...stored, width: checked.width, height: checked.height });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Artwork could not be saved.";
    const status = /invalid|ticker|image|pixels|MB|choose/i.test(message) ? 400 : 503;
    return json({ error: message, saved: false }, status);
  }
}

export async function DELETE(request: Request) {
  if (!trustedBrowserOrigin(request)) return json({ error: "Origin rejected", saved: false }, 403);
  const limited = rateLimitOr429(request, "solana-token-artwork-delete", 8);
  if (limited) return limited;
  const draftId = await draftFromCookie();
  if (!draftId) return json({ saved: false });
  try {
    await deleteTokenArtwork(draftId);
    return json({ saved: false, removed: true });
  } catch {
    return json({ error: "Artwork could not be removed.", saved: true }, 503);
  }
}
