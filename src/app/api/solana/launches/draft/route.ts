import { createAdminClient } from "@/lib/supabase";
import { isStoredArtworkUrl } from "@/lib/solana/artwork-store";
import { json, sameOrigin, smallJson } from "@/lib/solana/http";
import { memberSessionHash } from "@/lib/solana/members";

export const dynamic = "force-dynamic";

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/[<>\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

function artwork(value: unknown) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return typeof value === "string" && supabaseUrl && isStoredArtworkUrl(value, supabaseUrl) ? value : "";
}

export async function GET() {
  const hash = await memberSessionHash();
  if (!hash) return json({ saved: false }, 401);
  const db = createAdminClient();
  if (!db) return json({ saved: false, error: "Draft storage is unavailable." }, 503);
  const { data, error } = await db.rpc("gp_sol_token_draft_read", { p_hash: hash });
  if (error) return json({ saved: false, error: "Draft storage is unavailable." }, 503);
  return json({ saved: Boolean(data), draft: data ?? null });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origin rejected", saved: false }, 403);
  const hash = await memberSessionHash();
  if (!hash) return json({ error: "Connect your wallet before saving this draft.", saved: false }, 401);
  try {
    const body = await smallJson(request);
    const payload = {
      name: clip(body.name, 32),
      symbol: clip(body.symbol, 10).toUpperCase(),
      description: clip(body.description, 500),
      keywords: clip(body.keywords, 120),
      concept: clip(body.concept, 280),
      website: clip(body.website, 200),
      social: clip(body.social, 200),
      reward: body.reward === "holders" ? "holders" : "creator",
      imageUrl: artwork(body.imageUrl),
      metadataUrl: artwork(body.metadataUrl),
    };
    const db = createAdminClient();
    if (!db) return json({ error: "Draft storage is unavailable.", saved: false }, 503);
    const { error } = await db.rpc("gp_sol_token_draft_save", { p_hash: hash, p_payload: payload });
    if (error) return json({ error: "This draft could not be saved to your wallet.", saved: false }, 503);
    return json({ saved: true });
  } catch {
    return json({ error: "Invalid draft", saved: false }, 400);
  }
}
