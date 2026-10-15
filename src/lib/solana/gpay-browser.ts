import { ed25519 } from "@noble/curves/ed25519";
import { PublicKey } from "@solana/web3.js";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SUFFIX = "gpay";
const MODULUS = 58 ** SUFFIX.length;

/** Last four base58 characters of a 32-byte public key. */
export function gpayTail(bytes: Uint8Array) {
  let mod = 0;
  for (const byte of bytes) mod = (mod * 256 + byte) % MODULUS;
  let suffix = "";
  for (let digit = 0; digit < SUFFIX.length; digit += 1) {
    suffix = ALPHABET[mod % 58] + suffix;
    mod = Math.floor(mod / 58);
  }
  return suffix;
}

export class GpaySearchError extends Error {
  constructor(readonly code: "cancelled" | "exhausted" | "timeout" | "browser") {
    super(code === "cancelled" ? "Mint search cancelled" : code === "timeout" ? "Mint search timed out. Nothing was submitted." : code === "browser" ? "Mint search does not run in the browser. Nothing was submitted." : "Mint search ended before a gpay address was found");
  }
}

/** Finds a real ed25519 address ending in gpay. The secret stays in the returned array until the caller wipes it. */
export async function findGpayMint(options: {
  signal?: AbortSignal;
  onProgress?: (attempts: number) => void;
  maxAttempts?: number;
  batch?: number;
  maxMs?: number;
} = {}) {
  if (typeof window !== "undefined") throw new GpaySearchError("browser");
  const maxAttempts = options.maxAttempts ?? 30_000_000;
  const batch = options.batch ?? 250;
  let attempts = 0;
  const deadline = Date.now() + (options.maxMs ?? 180000);
  while (attempts < maxAttempts) {
    if (Date.now() >= deadline) throw new GpaySearchError("timeout");
    if (options.signal?.aborted) throw new GpaySearchError("cancelled");
    const stop = Math.min(maxAttempts, attempts + batch);
    for (; attempts < stop; attempts += 1) {
      const seed = ed25519.utils.randomPrivateKey();
      const publicKey = ed25519.getPublicKey(seed);
      if (gpayTail(publicKey) !== SUFFIX) {
        seed.fill(0);
        continue;
      }
      const encoded = new PublicKey(publicKey).toBase58();
      if (!encoded.endsWith(SUFFIX)) {
        seed.fill(0);
        throw new GpaySearchError("exhausted");
      }
      const secret = new Uint8Array(64);
      secret.set(seed);
      secret.set(publicKey, 32);
      seed.fill(0);
      options.onProgress?.(attempts + 1);
      return { publicKey: encoded, secret, attempts: attempts + 1 };
    }
    options.onProgress?.(attempts);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new GpaySearchError("exhausted");
}
