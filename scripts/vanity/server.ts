/** Isolated single-host Devnet mint worker. No member wallet keys; no mainnet RPC. */
import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, unlinkSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { SealedMintKeypair } from "../../src/lib/solana/mint-keypair";
import { verifyWorkerRequest } from "../../src/lib/solana/mint-worker-auth";
import { validateTokenMetadata } from "../../src/lib/solana/token-metadata";
import { prepareDevnetCoin } from "../../src/lib/solana/devnet-coin";
import { submitLaunch } from "../../src/lib/solana/devnet-completion";

const root = process.env.GARMONPAY_MINT_PRIVATE_DIR;
const shared = process.env.GARMONPAY_MINT_WORKER_KEY || "";
if (!root || !root.startsWith("/") || shared.length < 43 || process.env.SOLANA_CLUSTER !== "devnet") throw new Error("Private Devnet worker configuration required");
mkdirSync(root, { recursive: true, mode: 0o700 }); chmodSync(root, 0o700);
const keyPath = join(root, "encryption-key");
let key: Buffer;
try { key = readFileSync(keyPath); } catch { key = randomBytes(32); writeFileSync(keyPath, key, { mode: 0o600, flag: "wx" }); }
if (key.length !== 32) throw new Error("Invalid worker encryption key");
chmodSync(keyPath, 0o600);
type Job = { id: string; owner: string; draft: ReturnType<typeof validateTokenMetadata>; imageUrl: string; status: string; attempts: number; started: number; expires: number; mint?: string; secret?: string; uri?: string; transaction?: string; height?: number; result?: unknown; error?: string; controller?: AbortController; sealed?: SealedMintKeypair; busy?: boolean };
const jobs = new Map<string, Job>(), seen = new Map<string, number>();
let active = false;
function save(job: Job) {
  const { controller, sealed, busy, ...record } = job;
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(record));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]); plain.fill(0);
  const file = join(root!, `${job.id}.enc`);
  writeFileSync(`${file}.tmp`, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 }); renameSync(`${file}.tmp`, file);
}
for (const file of readdirSync(root)) {
  if (!/^[a-f0-9]{32}\.enc$/.test(file)) continue;
  try {
    const bytes = readFileSync(join(root, file)); const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(12, 28));
    const plain = Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]); const job: Job = JSON.parse(plain.toString()); plain.fill(0);
    if (job.expires < Date.now()) { unlinkSync(join(root, file)); continue; }
    if (job.status === "searching") { job.status = "failed"; job.error = "Mint worker restarted during search. Retry; nothing was signed."; }
    if (job.secret) job.sealed = SealedMintKeypair.seal(job.mint!, Buffer.from(job.secret, "base64"));
    jobs.set(job.id, job);
  } catch { throw new Error("Encrypted mint state could not be recovered"); }
}
function view(job: Job) { return { jobId: job.id, status: job.status, attempts: job.attempts, elapsedMs: Date.now() - job.started, mint: job.mint, expiresAt: job.expires, result: job.result, error: job.error, draft: job.draft, imageUrl: job.imageUrl, cluster: "devnet" }; }
function sweep() { for (const [id, job] of jobs) if (job.expires < Date.now() && !job.busy) { job.controller?.abort(); job.sealed?.destroy(); job.secret = undefined; jobs.delete(id); try { unlinkSync(join(root!, `${id}.enc`)); } catch {} } }
setInterval(sweep, 30000).unref();
async function dispatch(body: Record<string, any>) {
  sweep();
  const owner = new PublicKey(body.owner).toBase58();
  if (body.action === "start") {
    const existing = [...jobs.values()].find(job => job.owner === owner && ["searching", "ready", "submitting", "uncertain"].includes(job.status));
    const draft = validateTokenMetadata(body.draft);
    const sameCoin = existing && JSON.stringify(existing.draft) === JSON.stringify(draft) && existing.imageUrl === (body.imageUrl || "");
    if (existing && ["submitting", "uncertain"].includes(existing.status)) throw new Error("A launch for this wallet is still being confirmed on Devnet. It was not cancelled.");
    if (existing && sameCoin && ["searching", "ready"].includes(existing.status)) return view(existing);
    if (existing && !["submitting", "uncertain", "created"].includes(existing.status)) { existing.status = "cancelled"; existing.controller?.abort(); existing.sealed?.destroy(); existing.secret = undefined; save(existing); jobs.delete(existing.id); }
    if (active || jobs.size >= 24) throw new Error("Mint worker is busy. Your details are preserved; retry shortly.");
    if ([...jobs.values()].filter(job => job.owner === owner && job.started > Date.now() - 3600000).length >= 3) throw new Error("Mint search limit reached. Please retry after an hour.");
    const job: Job = { id: randomBytes(16).toString("hex"), owner, draft, imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : "", status: "searching", attempts: 0, started: Date.now(), expires: Date.now() + 45 * 60000, controller: new AbortController() };
    jobs.set(job.id, job); save(job); active = true;
    const generated = Keypair.generate();
    const sealed = SealedMintKeypair.seal(generated.publicKey.toBase58(), generated.secretKey);
    job.sealed = sealed; job.mint = sealed.publicKey;
    const signer = sealed.ephemeralSigner();
    try { job.secret = Buffer.from(signer.secretKey).toString("base64"); } finally { signer.secretKey.fill(0); }
    job.status = "ready"; save(job); active = false;
    return view(job);
  }
  if (body.action === "current") {
    const reserved = [...jobs.values()].find(job => job.owner === owner && job.expires >= Date.now());
    if (!reserved) return { status: "idle", cluster: "devnet", replaceable: false };
    return { ...view(reserved), replaceable: ["searching", "ready", "failed", "cancelled"].includes(reserved.status) };
  }
  const job = typeof body.jobId === "string" ? jobs.get(body.jobId) : [...jobs.values()].find(item => item.owner === owner);
  if (!job || job.owner !== owner) throw new Error("This mint reservation is unavailable or expired. Retry the launch.");
  if (body.action === "status") return view(job);
  if (body.action === "cancel") {
    if (["submitting", "uncertain", "created"].includes(job.status)) return { ...view(job), replaceable: false, error: "This launch was already submitted. It was not cancelled." };
    job.status = "cancelled"; job.controller?.abort(); job.sealed?.destroy(); job.secret = undefined; save(job); return view(job);
  }
  if (body.action === "prepare") {
    if (job.status !== "ready" || !job.sealed || job.busy) throw new Error("Mint reservation is not ready for signing");
    if (typeof body.uri !== "string" || (job.uri && job.uri !== body.uri)) throw new Error("Mint metadata cannot change during launch");
    job.uri = body.uri; job.busy = true;
    try {
      const prepared = await prepareDevnetCoin({ payer: owner, mint: job.mint, name: job.draft.name, symbol: job.draft.symbol, uri: job.uri });
      if (!("unsignedTransaction" in prepared)) throw new Error("Devnet platform must be initialized first");
      const tx = Transaction.from(Buffer.from(prepared.unsignedTransaction, "base64"));
      const signer = job.sealed.ephemeralSigner();
      let signed = "";
      try {
        tx.partialSign(signer);
        signed = tx.serialize({ requireAllSignatures: false }).toString("base64");
      } finally { signer.secretKey.fill(0); }
      save(job);
      return { ...prepared, unsignedTransaction: signed, kind: "launch", mint: job.mint, uri: job.uri, jobId: job.id };
    } finally { job.busy = false; }
  }
  if (body.action === "resume") {
    if (job.status === "created") return job.result;
    if (!job.transaction) throw new Error("No submitted transaction needs recovery");
    body = { ...body, action: "submit", transaction: job.transaction, lastValidBlockHeight: job.height };
  }
  if (body.action === "submit") {
    if (job.status === "created") return job.result;
    if (job.busy) throw new Error("This launch is already being processed. Check its status.");
    if (!["ready", "submitting", "uncertain"].includes(job.status)) throw new Error("Mint reservation is not available");
    if (job.transaction && job.transaction !== body.transaction) throw new Error("This mint already has a pending transaction. Resume its confirmation.");
    if (typeof body.transaction !== "string" || body.transaction.length > 4000) throw new Error("Invalid transaction");
    job.busy = true; job.transaction = body.transaction; job.height = body.lastValidBlockHeight; job.status = "submitting"; save(job);
    try {
      const result = await submitLaunch({ ...job.draft, mint: job.mint, uri: job.uri, lastValidBlockHeight: job.height }, owner, job.transaction!);
      job.status = "created"; job.result = result; job.sealed?.destroy(); job.secret = undefined; save(job); return result;
    } catch (error: any) {
      if (error.code === "BLOCKHASH_EXPIRED" || error.code === "SIMULATION_FAILED") { job.status = "ready"; job.transaction = undefined; job.height = undefined; }
      else { job.status = "uncertain"; }
      save(job); throw error;
    } finally { job.busy = false; }
  }
  throw new Error("Unsupported worker action");
}
const server = createServer(async (req, res) => {
  res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store");
  if (req.method !== "POST" || req.url !== "/") { res.writeHead(404); res.end('{}'); return; }
  let raw = "";
  try {
    for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 16000) throw new Error("Request too large"); }
    const headers = new Headers(); for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
    if (!verifyWorkerRequest(raw, headers, shared, seen)) { res.writeHead(403); res.end('{"error":"Worker authentication rejected"}'); return; }
    const result = await dispatch(JSON.parse(raw));
    const body = JSON.stringify(result);
    if (/"secret"\s*:/.test(body)) { res.writeHead(500); res.end('{"error":"Worker response withheld"}'); return; }
    res.end(body);
  } catch (error: any) { res.writeHead(400); res.end(JSON.stringify({ error: String(error.message || "Worker request failed").replace(/[1-9A-HJ-NP-Za-km-z]{80,}/g, "[redacted]").replace(/[A-Za-z0-9+/]{40,}={0,2}/g, "[redacted]").slice(0, 240), code: error.code })); }
});
server.requestTimeout = 60000; server.headersTimeout = 10000; server.maxConnections = 16;
server.listen(Number(process.env.PORT || 4338), "127.0.0.1", () => console.info("Isolated Devnet mint worker ready"));
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { for (const job of jobs.values()) { job.controller?.abort(); save(job); job.sealed?.destroy(); } server.close(); process.exit(0); });
