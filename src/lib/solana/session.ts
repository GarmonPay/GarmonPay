import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase";
import { digest } from "./auth-crypto";
import { SOLANA_SESSION_COOKIE, walletAuthEnabled } from "./policy";
/** Isolated identity: never maps a caller's wallet onto a legacy user's balances or admin role. */
export async function getSolanaSession() {
  if (!walletAuthEnabled()) return null;
  const token = (await cookies()).get(SOLANA_SESSION_COOKIE)?.value;
  if (!token || !/^[\w-]{43}$/.test(token)) { console.info("[garmonpay-auth]", "session-cookie-missing"); return null; }
  const db = createAdminClient(); if (!db) { console.info("[garmonpay-auth]", "session-storage-unavailable"); return null; }
  const { data, error } = await db.from("gp_sol_sessions").select("wallet_address,expires_at").eq("token_hash", digest(token)).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !data) { console.info("[garmonpay-auth]", error ? "session-lookup-failed" : "session-expired-or-revoked"); return null; }
  const { data: identity, error: identityError } = await db.from("gp_sol_identities").select("wallet_address").eq("wallet_address", data.wallet_address).eq("banned", false).maybeSingle();
  console.info("[garmonpay-auth]", identityError ? "identity-lookup-failed" : identity ? "session-recognized" : "identity-unavailable");
  return !identityError && identity ? { wallet: data.wallet_address as string, expiresAt: data.expires_at as string } : null;
}
