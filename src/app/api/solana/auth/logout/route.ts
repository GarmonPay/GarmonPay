import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase";
import { digest } from "@/lib/solana/auth-crypto";
import { json, sameOrigin, walletCookieOptions } from "@/lib/solana/http";
import { SOLANA_SESSION_COOKIE, SOLANA_CHALLENGE_COOKIE } from "@/lib/solana/policy";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origin rejected" }, 403);
  const token = (await cookies()).get(SOLANA_SESSION_COOKIE)?.value;
  if (token) {
    const db = createAdminClient(); if (!db) return json({ error: "Sign-out unavailable; please retry" }, 503);
    const {error} = await db.from("gp_sol_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", digest(token));
    if (error) return json({ error: "Sign-out unavailable; please retry" }, 503);
  }
  const jar = await cookies();
  jar.set(SOLANA_SESSION_COOKIE, "", { ...walletCookieOptions, maxAge: 0 });
  jar.set(SOLANA_CHALLENGE_COOKIE, "", { ...walletCookieOptions, maxAge: 0 });
  return json({ ok: true });
}
