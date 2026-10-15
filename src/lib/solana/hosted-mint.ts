import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { digest } from "./auth-crypto";
import { prepareDevnetCoin } from "./devnet-coin";
import { devnetLaunchNotSent, submitLaunch } from "./devnet-completion";
import { validateTokenMetadata } from "./token-metadata";
import { SealedMintKeypair } from "./mint-keypair";

export const HOSTED_MINT_COOKIE = "gp-devnet-mint";
const JOB_MS = 45 * 60 * 1000;

type JobStatus = "searching" | "ready" | "submitting" | "uncertain" | "created" | "cancelled" | "failed";
type Job = {
  id: string;
  owner: string;
  draftHash: string;
  imageUrl: string;
  status: JobStatus;
  attempts: number;
  started: number;
  expires: number;
  starts: number[];
  mint?: string;
  secret?: string;
  uri?: string;
  transaction?: string;
  height?: number;
  result?: unknown;
  error?: string;
};

export function encryptMintSecret(secret: string, key: Buffer = mintSealKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(secret, "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  plain.fill(0);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptMintSecret(token: string, key: Buffer = mintSealKey()) {
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length < 29) throw new Error("Mint inventory record is unreadable");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const plain = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  const value = plain.toString("utf8");
  plain.fill(0);
  return value;
}

export function inventorySealKey(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (secret.length < 20) throw new Error("Mint inventory storage is not configured. Nothing was submitted.");
  return createHash("sha256").update("garmonpay-devnet-mint-inventory-v1\0").update(secret).digest();
}

export function mintSealKey(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.SOLANA_AUTH_RATE_SECRET || "";
  if (secret.length < 32) throw new Error("Mint reservation storage is not configured. Nothing was submitted.");
  return createHash("sha256").update("garmonpay-devnet-mint-v1\0").update(secret).digest();
}

export function metadataHash(body: Record<string, unknown>) {
  const metadata = validateTokenMetadata(body);
  return digest(JSON.stringify(metadata));
}

export function sealMintRecord(job: Job, key: Buffer) {
  const copy: Job = { ...job };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(copy));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  plain.fill(0);
  if (copy.secret) copy.secret = "";
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function openMintRecord(token: string, key: Buffer): Job | null {
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.length < 29 || bytes.length > 3500) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    const job = JSON.parse(plain.toString("utf8")) as Job;
    plain.fill(0);
    if (!job || typeof job.id !== "string" || !/^[a-f0-9]{32}$/.test(job.id)) return null;
    return job;
  } catch {
    return null;
  }
}

export function generateLaunchMint() {
  const signer = Keypair.generate();
  try {
    return { id: randomBytes(16).toString("hex"), mint: signer.publicKey.toBase58(), secret: Buffer.from(signer.secretKey).toString("base64") };
  } finally {
    signer.secretKey.fill(0);
  }
}

export function publicMintJob(job: Job) {
  return {
    jobId: job.id,
    status: job.status,
    attempts: job.attempts,
    elapsedMs: Math.max(0, Date.now() - job.started),
    mint: job.mint ?? null,
    expiresAt: job.expires,
    cluster: "devnet" as const,
    draftHash: job.draftHash,
    imageUrl: job.imageUrl,
    error: job.error,
    result: job.result,
  };
}

function validStoredMint(job: Job) {
  if (!job.mint || !job.secret) return false;
  try { const keypair = SealedMintKeypair.seal(job.mint, Buffer.from(job.secret, "base64")); keypair.destroy(); return true; }
  catch { return false; }
}

function wipe(job: Job) {
  job.secret = undefined;
}

function expired(job: Job) {
  return job.expires < Date.now();
}

function submitted(job: Job) {
  return ["submitting", "uncertain", "created"].includes(job.status) || Boolean(job.transaction);
}

function replaceable(job: Job) {
  return !submitted(job);
}

function packed(job: Job, key: Buffer) {
  const token = sealMintRecord(job, key);
  if (token.length <= 3400 || !job.transaction) return token;
  return sealMintRecord({ ...job, transaction: undefined }, key);
}

export async function runHostedMint(input: {
  action: string;
  owner: string;
  cookie?: string;
  jobId?: string;
  draft?: Record<string, unknown>;
  imageUrl?: string;
  uri?: string;
  transaction?: string;
  lastValidBlockHeight?: number;
  signal?: AbortSignal;
  maxSliceMs?: number;
  reserved?: { id: string; mint: string; secret: string };
  replaceUnconfirmed?: boolean;
}, key: Buffer) {
  const now = Date.now();
  const current = input.cookie ? openMintRecord(input.cookie, key) : null;
  if (input.action === "current") {
    if (!current || current.owner !== input.owner || expired(current)) {
      return { status: 200, body: { status: "idle", cluster: "devnet", replaceable: false }, cookie: current?.owner === input.owner && expired(current) ? "" : undefined };
    }
    return { status: 200, body: { ...publicMintJob(current), replaceable: replaceable(current) }, cookie: packed(current, key) };
  }
  if (current && (current.owner !== input.owner || expired(current))) {
    if (current.owner === input.owner && expired(current) && input.action !== "start") {
      return { status: 200, body: { status: "idle", cluster: "devnet", replaceable: false, error: "That preparation expired. Press Launch again. Nothing was submitted." }, cookie: "" };
    }
  }
  const job = current && current.owner === input.owner && !expired(current) ? current : null;
  if (input.action === "start") {
    const draft = validateTokenMetadata(input.draft || {});
    const draftHash = digest(JSON.stringify(draft));
    const imageUrl = typeof input.imageUrl === "string" ? input.imageUrl.slice(0, 400) : "";
    if (!input.reserved && job && job.status === "ready" && !submitted(job) && job.secret && validStoredMint(job) && job.draftHash === draftHash && job.imageUrl === imageUrl) {
      return { status: 200, body: publicMintJob(job), cookie: packed(job, key) };
    }
    if (job && submitted(job) && job.status !== "created" && !input.replaceUnconfirmed) {
      return { status: 409, body: { ...publicMintJob(job), replaceable: false, error: "A launch for this wallet is still being confirmed on Devnet. It was not cancelled." }, cookie: packed(job, key) };
    }
    const minted = input.reserved?.secret && input.reserved.mint ? input.reserved : generateLaunchMint();
    if (job && (!submitted(job) || input.replaceUnconfirmed || job.status === "created")) wipe(job);
    const created: Job = { id: minted.id, owner: input.owner, draftHash, imageUrl, status: "ready", attempts: 0, started: now, expires: now + JOB_MS, starts: [...(job?.starts ?? []), now], mint: minted.mint, secret: minted.secret };
    return { status: 200, body: publicMintJob(created), cookie: packed(created, key) };
  }
  if (!job) {
    return { status: 200, body: { status: "idle", cluster: "devnet", replaceable: false }, cookie: "" };
  }
  if (input.jobId && job.id !== input.jobId && input.action !== "cancel") {
    return { status: 409, body: { ...publicMintJob(job), error: "This mint reservation is unavailable or expired. Retry the launch." }, cookie: packed(job, key) };
  }
  if (input.action === "status") {
    if (job.status === "searching") {
      job.status = "cancelled";
      wipe(job);
      return { status: 200, body: { ...publicMintJob(job), error: "That mint search was retired. Press Launch to create the coin." }, cookie: packed(job, key) };
    }
    return { status: 200, body: publicMintJob(job), cookie: packed(job, key) };
  }
  if (input.action === "cancel") {
    if (submitted(job)) return { status: 200, body: { ...publicMintJob(job), replaceable: false, error: "This launch was already submitted. It was not cancelled." }, cookie: packed(job, key) };
    job.status = "cancelled";
    wipe(job);
    return { status: 200, body: { ...publicMintJob(job), replaceable: false }, cookie: packed(job, key) };
  }
  if (input.action === "prepare") {
    if (job.status !== "ready" || !job.secret) return { status: 409, body: { ...publicMintJob(job), error: "Mint reservation is not ready for signing" }, cookie: packed(job, key) };
    const draft = validateTokenMetadata(input.draft || {});
    if (digest(JSON.stringify(draft)) !== job.draftHash) return { status: 409, body: { error: "Coin details changed after mint reservation. Cancel the reservation before changing details." }, cookie: packed(job, key) };
    if (typeof input.uri !== "string" || (job.uri && job.uri !== input.uri)) return { status: 409, body: { error: "Mint metadata cannot change during launch" }, cookie: packed(job, key) };
    job.uri = input.uri;
    const prepared = await prepareDevnetCoin({ payer: input.owner, mint: job.mint, name: draft.name, symbol: draft.symbol, uri: job.uri });
    if (!("unsignedTransaction" in prepared)) throw new Error("Devnet platform must be initialized first");
    const tx = Transaction.from(Buffer.from(prepared.unsignedTransaction, "base64"));
    const secret = Buffer.from(job.secret, "base64");
    const sealed = SealedMintKeypair.seal(job.mint!, new Uint8Array(secret));
    secret.fill(0);
    let signed = "";
    try {
      tx.addSignature(new PublicKey(job.mint!), Buffer.from(sealed.sign(tx.serializeMessage())));
      signed = tx.serialize({ requireAllSignatures: false }).toString("base64");
    } finally { sealed.destroy(); }
    return { status: 200, body: { ...prepared, unsignedTransaction: signed, kind: "launch", mint: job.mint, uri: job.uri, jobId: job.id }, cookie: packed(job, key) };
  }
  if (input.action === "resume") {
    if (job.status === "created") return { status: 200, body: job.result, cookie: packed(job, key) };
    if (!job.transaction || !job.height) return { status: 409, body: { ...publicMintJob(job), error: "No submitted transaction needs recovery" }, cookie: packed(job, key) };
    input = { ...input, action: "submit", transaction: job.transaction, lastValidBlockHeight: job.height };
  }
  if (input.action === "submit") {
    if (job.status === "created") return { status: 200, body: job.result, cookie: packed(job, key) };
    if (!["ready", "submitting", "uncertain"].includes(job.status) || !job.mint || !job.uri) return { status: 409, body: { ...publicMintJob(job), error: "Mint reservation is not available" }, cookie: packed(job, key) };
    if (job.transaction && job.transaction !== input.transaction) return { status: 409, body: { error: "This mint already has a pending transaction. Resume its confirmation.", code: "SUBMISSION_UNCERTAIN", submitted: true, signature: job.result && typeof job.result === "object" && "signature" in job.result ? (job.result as { signature?: string }).signature : undefined }, cookie: packed(job, key) };
    if (typeof input.transaction !== "string" || input.transaction.length > 4000) return { status: 400, body: { error: "Invalid transaction" }, cookie: packed(job, key) };
    job.transaction = input.transaction;
    job.height = input.lastValidBlockHeight;
    job.status = "submitting";
    try {
      const draft = validateTokenMetadata(input.draft || {});
      const result = await submitLaunch({ ...draft, mint: job.mint, uri: job.uri, lastValidBlockHeight: job.height }, input.owner, job.transaction);
      job.status = "created";
      job.result = result;
      wipe(job);
      return { status: 200, body: result, cookie: packed(job, key) };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";
      if (devnetLaunchNotSent(code)) { job.status = "ready"; job.transaction = undefined; job.height = undefined; }
      else job.status = "uncertain";
      const sealed = packed(job, key);
      throw Object.assign(error instanceof Error ? error : new Error("Devnet token creation did not finish"), { mintCookie: sealed });
    }
  }
  return { status: 400, body: { error: "Unsupported mint action" }, cookie: job ? packed(job, key) : undefined };
}
