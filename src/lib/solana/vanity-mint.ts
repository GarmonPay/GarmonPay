import { SealedMintKeypair } from "./mint-keypair";
import { Worker } from "node:worker_threads";
import { PublicKey } from "@solana/web3.js";
import { SOLANA_POLICY } from "./policy";

export const GPAY_MINT_SUFFIX = "gpay";
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SUFFIX_MODULUS = 58 ** GPAY_MINT_SUFFIX.length;

/** Last four base58 characters. Valid for 32-byte keys, which encode to more than four characters. */
export function base58Suffix(bytes: Uint8Array, length = GPAY_MINT_SUFFIX.length) {
  let mod = 0;
  for (const byte of bytes) mod = (mod * 256 + byte) % SUFFIX_MODULUS;
  let suffix = "";
  for (let i = 0; i < length; i += 1) {
    suffix = ALPHABET[mod % 58] + suffix;
    mod = Math.floor(mod / 58);
  }
  return suffix;
}

export function encodeBase58(bytes: Uint8Array) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let encoded = "";
  for (let i = 0; i < bytes.length - 1 && bytes[i] === 0; i += 1) encoded += "1";
  for (let i = digits.length - 1; i >= 0; i -= 1) encoded += ALPHABET[digits[i]];
  return encoded;
}

export function hasExactGpaySuffix(mint: string) {
  return mint.length >= 32 && mint.endsWith(GPAY_MINT_SUFFIX) && !mint.endsWith("Gpay") && mint.slice(-4) === GPAY_MINT_SUFFIX;
}

export class VanitySearchError extends Error {
  constructor(readonly code: "cancelled" | "exhausted" | "failed", message: string) {
    super(message);
  }
}

export { SealedMintKeypair } from "./mint-keypair";

export type VanityProgress = { attempts: number; elapsedMs: number; publicKey: string | null };

export async function searchVanityMint(options: {
  suffix?: string;
  signal?: AbortSignal;
  concurrency?: number;
  maxAttempts?: number;
  maxMs?: number;
  onProgress?: (progress: VanityProgress) => void;
} = {}) {
  const suffix = options.suffix ?? GPAY_MINT_SUFFIX;
  if (!/^[1-9A-HJ-NP-Za-km-z]{1,4}$/.test(suffix)) throw new Error("Unsupported mint suffix");
  const concurrency = Math.min(4, Math.max(1, options.concurrency ?? 4));
  const maxAttempts = options.maxAttempts ?? 20_000_000;
  const maxMs = options.maxMs ?? 600_000;
  const started = Date.now();
  const workerUrl = new URL("./vanity-grind.mjs", import.meta.url);
  return new Promise<SealedMintKeypair>((resolve, reject) => {
    const workers: Worker[] = [];
    let attempts = 0;
    let finished = 0;
    let settled = false;
    if (options.signal?.aborted) { reject(new VanitySearchError("cancelled", "Mint search cancelled")); return; }
    let deadline: ReturnType<typeof setTimeout>;
    const onAbort = () => stop(() => reject(new VanitySearchError("cancelled", "Mint search cancelled")));
    const stop = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      options.signal?.removeEventListener("abort", onAbort);
      for (const worker of workers) void worker.terminate();
      settle();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    deadline = setTimeout(() => stop(() => reject(new VanitySearchError("exhausted", "Mint worker deadline reached"))), maxMs + 1000);
    for (let index = 0; index < concurrency; index += 1) {
      const worker = new Worker(workerUrl, { workerData: { suffix, maxAttempts: Math.ceil(maxAttempts / concurrency), maxMs } });
      workers.push(worker);
      let reportedDone = false;
      worker.on("message", (message: { type: string; attempts?: number; publicKey?: Uint8Array; secret?: Uint8Array }) => {
        if (settled) { message.secret?.fill(0); return; }
        if (message.type === "progress" || message.type === "found") {
          attempts += message.attempts ?? 0;
          options.onProgress?.({ attempts, elapsedMs: Date.now() - started, publicKey: null });
        }
        if (message.type === "found" && message.publicKey && message.secret) {
          const publicKey = encodeBase58(message.publicKey);
          if (!publicKey.endsWith(suffix)) {
            message.secret.fill(0);
            stop(() => reject(new VanitySearchError("failed", "Mint suffix check failed")));
            return;
          }
          const sealed = SealedMintKeypair.seal(publicKey, message.secret);
          options.onProgress?.({ attempts, elapsedMs: Date.now() - started, publicKey });
          stop(() => resolve(sealed));
          return;
        }
        if (message.type === "done") {
          reportedDone = true;
          finished += 1;
          if (finished === concurrency) stop(() => reject(new VanitySearchError("exhausted", "Mint search ended before a gpay address was found")));
        }
      });
      worker.on("exit", () => { if (!settled && !reportedDone) stop(() => reject(new VanitySearchError("failed", "Mint worker stopped unexpectedly"))); });
      worker.on("error", () => stop(() => reject(new VanitySearchError("failed", "Mint search failed"))));
    }
  });
}

/** Production web requests must not grind, and no cluster setting can turn mainnet submission on. */
export function vanitySearchAllowed(env: NodeJS.ProcessEnv = process.env) {
  return env.GARMONPAY_VANITY_WORKER === "1" && env.NODE_ENV !== "production" && env.SOLANA_CLUSTER !== "mainnet-beta";
}

export function guardLaunchSubmission(mint: string, cluster: string) {
  try { new PublicKey(mint); } catch { throw new Error("The mint address is invalid"); }
  const launchesEnabled: boolean = SOLANA_POLICY.tokenLaunches;
  if (cluster === "mainnet-beta" || !launchesEnabled) throw new Error("Launch submission is disabled");
}

export function raydiumExternalMintPlan(mint: string) {
  try { new PublicKey(mint); } catch { throw new Error("The mint address is invalid"); }
  return { mintA: mint, extraSigners: 1, curve: "virtual_constant_product" as const, secretIncluded: false as const, launchEnabled: false as const };
}
