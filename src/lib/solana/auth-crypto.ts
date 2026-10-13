import {ed25519} from "@noble/curves/ed25519";
import { createHash, createHmac, randomBytes } from "node:crypto";
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function decodeBase58(value: string): Buffer {
  if (!value || value.length > 100) throw new Error("Invalid base58");
  let n = BigInt(0);
  for (const c of value) { const digit = ALPHABET.indexOf(c); if (digit < 0) throw new Error("Invalid base58"); n = n * BigInt(58) + BigInt(digit); }
  const bytes: number[] = []; while (n > BigInt(0)) { bytes.unshift(Number(n % BigInt(256))); n /= BigInt(256); }
  for (const c of value) { if (c !== "1") break; bytes.unshift(0); }
  return Buffer.from(bytes);
}
export function validateWallet(address: string) { if (decodeBase58(address).length !== 32) throw new Error("Invalid Solana wallet"); return address; }
export function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function randomToken() { return randomBytes(32).toString("base64url"); }
/** SIWS specifies an alphanumeric nonce of at least eight characters. */
export function randomNonce() { return randomBytes(16).toString("hex"); }
export function authOrigin() {
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://garmonpay.com");
  if (origin.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) throw new Error("Secure site origin required");
  return origin.origin;
}
export function challengeMessage(wallet: string, nonce: string, origin: string, issuedAt: string, expiresAt: string) {
  return `${new URL(origin).host} wants you to sign in with your Solana account:\n${wallet}\n\nSign in to GarmonPay. This does not authorize a transaction or transfer.\n\nURI: ${origin}\nVersion: 1\nChain ID: solana:mainnet\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expiresAt}`;
}
export function verifyWalletSignature(address: string, message: string, signature: string): boolean {
  try {
    const bytes = decodeBase58(validateWallet(address));
    if (!/^[A-Za-z0-9+/]{86}==$/.test(signature)) return false;
    const sig = Buffer.from(signature, "base64");
    if(sig.length!==64 || sig.toString("base64")!==signature)return false;
    // Authentication needs a canonical, nonzero prime-order wallet key. A
    // permissive consensus verifier can accept trivial small-order signatures.
    const point=ed25519.Point.fromHex(bytes,false);
    if(point.isSmallOrder() || !point.isTorsionFree())return false;
    return ed25519.verify(sig,Buffer.from(message,"utf8"),bytes,{zip215:false});
  } catch { return false; }
}

export function authenticationRateKey(request: Request) {
  const secret=process.env.SOLANA_AUTH_RATE_SECRET;
  if(!secret || secret.length<32) throw new Error("Authentication rate secret required");
  // Vercel's trusted edge IP header; this value never authenticates a wallet.
  const ip=process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : "local";
  if(!ip) throw new Error("Trusted client address unavailable");
  return createHmac("sha256",secret).update(ip).digest("hex");
}
