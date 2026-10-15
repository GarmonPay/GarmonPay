import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase";
import { authenticationRateKey, authOrigin, challengeMessage, digest, randomNonce, randomToken, validateWallet } from "@/lib/solana/auth-crypto";
import { json, sameOrigin, smallJson, walletCookieOptions } from "@/lib/solana/http";
import { SOLANA_CHALLENGE_COOKIE, walletAuthEnabled } from "@/lib/solana/policy";
import { authNetwork, AUTH_NETWORKS } from "@/lib/solana/auth-chain";
import { challengeDenied } from "@/lib/solana/challenge-result";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!walletAuthEnabled()) return json({ error: "Wallet sign-in is awaiting database verification." }, 503);
  if (!process.env.SOLANA_AUTH_RATE_SECRET || process.env.SOLANA_AUTH_RATE_SECRET.length < 32) return json({ error: "Authentication configuration unavailable" }, 503);
  try {
    if (!sameOrigin(request)) return json({ error: "Origin rejected" }, 403);
    console.info("[garmonpay-auth]", "challenge-request");
    const body = await smallJson(request); const network = authNetwork(body.network); const wallet = validateWallet(String(body.wallet || ""));
    const db = createAdminClient(); if (!db) return json({ error: "Authentication unavailable" }, 503);
    const nonce = randomNonce(), binding = randomToken(); const issuedTime=Date.now(), issuedAt = new Date(issuedTime).toISOString(), expiresAt = new Date(issuedTime + 5 * 60000).toISOString();
    const message = challengeMessage(wallet, nonce, authOrigin(), issuedAt, expiresAt, network);
    const { data, error } = await db.rpc("gp_sol_issue_challenge", { p_rate_key: authenticationRateKey(request), p_wallet: wallet, p_nonce: nonce, p_binding_hash: digest(binding), p_message: message, p_expires_at: expiresAt });
    if (error || !data) return challengeDenied(error);
    (await cookies()).set(SOLANA_CHALLENGE_COOKIE, binding, { ...walletCookieOptions, maxAge: 300 });
    console.info("[garmonpay-auth]", "challenge-issued", { messageChain: network, walletStandardChain: AUTH_NETWORKS[network].standard });
    return json({ challengeId: data, message, expiresAt, network });
  } catch { return json({ error: "Invalid authentication request" }, 400); }
}
