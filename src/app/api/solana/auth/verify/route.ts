import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase";
import { digest, randomToken, verifyWalletSignature } from "@/lib/solana/auth-crypto";
import { referralToken } from "@/lib/solana/referral-token";
import { json, sameOrigin, smallJson, walletCookieOptions } from "@/lib/solana/http";
import { SOLANA_CHALLENGE_COOKIE, SOLANA_SESSION_COOKIE, walletAuthEnabled } from "@/lib/solana/policy";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!walletAuthEnabled()) return json({ error: "Wallet sign-in unavailable" }, 503);
  try {
    console.info("[garmonpay-auth]", "verify-request");
    if (!sameOrigin(request)) return json({ error: "Origin rejected" }, 403);
    const body = await smallJson(request); const binding = (await cookies()).get(SOLANA_CHALLENGE_COOKIE)?.value;
    if (!binding || !/^[A-Za-z0-9_-]{43}$/.test(binding) || typeof body.challengeId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.challengeId) || typeof body.signature !== "string") return json({ error: "Sign-in challenge missing or expired. Retry in the same browser that requested it.", code: "CHALLENGE_MISSING" }, 401);
    const db = createAdminClient(); if (!db) return json({ error: "Authentication unavailable" }, 503);
    // Consume before verification: one attempt only, atomic across serverless instances.
    const { data, error } = await db.rpc("gp_sol_consume_challenge", { p_id: body.challengeId, p_binding_hash: digest(binding) });
    const challenge = Array.isArray(data) ? data[0] : null;
    const signatureAccepted = !!challenge && verifyWalletSignature(challenge.wallet_address, challenge.message, body.signature);
    if (error || !signatureAccepted) (await cookies()).delete(SOLANA_CHALLENGE_COOKIE);
    if (error) { console.info("[garmonpay-auth]", "challenge-store-failed"); return json({error:"Sign-in challenge lookup unavailable",code:"CHALLENGE_STORE"},503); }
    if (!challenge) { console.info("[garmonpay-auth]", "challenge-expired-or-used"); return json({error:"Sign-in challenge expired, was already used, or belongs to another browser. Start again.",code:"CHALLENGE_EXPIRED"},401); }
    if (!signatureAccepted) { console.info("[garmonpay-auth]", "signature-rejected"); return json({error:"Wallet signature rejected. Start a new sign-in request.",code:"SIGNATURE_REJECTED"},401); }
    console.info("[garmonpay-auth]", "signature-verified");
    const token = randomToken(), expiresAt = new Date(Date.now() + 60 * 60000).toISOString();
    const previousToken = (await cookies()).get(SOLANA_SESSION_COOKIE)?.value;
    const { error: sessionError } = await db.rpc("gp_sol_member_login", { p_wallet: challenge.wallet_address, p_token_hash: digest(token), p_expires_at: expiresAt,
      p_referral: referralToken(typeof body.referralCode === "string" ? body.referralCode : null),
      p_previous_token_hash: previousToken && /^[A-Za-z0-9_-]{43}$/.test(previousToken) ? digest(previousToken) : null });
    if (sessionError) { console.info("[garmonpay-auth]", "session-create-failed"); return json({ error: "Your signature was verified, but the member session could not be created. Please retry.", code: "SESSION_CREATE_FAILED" }, 503); }
    (await cookies()).set(SOLANA_SESSION_COOKIE, token, { ...walletCookieOptions, maxAge: 3600 });
    console.info("[garmonpay-auth]", "session-cookie-issued");
    return json({ wallet: challenge.wallet_address, expiresAt });
  } catch { return json({ error: "Invalid authentication request" }, 400); }
}
