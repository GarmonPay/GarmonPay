import { randomBytes } from "node:crypto";
import { GPAY_MINT_SUFFIX, SealedMintKeypair, VanitySearchError, searchVanityMint, vanitySearchAllowed } from "./vanity-mint";

export type PublicVanityStatus = {
  status: "idle" | "paused" | "searching" | "ready" | "cancelled" | "failed";
  suffix: typeof GPAY_MINT_SUFFIX;
  attempts: number;
  elapsedMs: number;
  publicKey: string | null;
  launchEnabled: false;
  submitted: false;
  reason: string;
};

type Job = PublicVanityStatus & {
  sealed: SealedMintKeypair | null;
  controller: AbortController | null;
  expiresAt: number;
  claimed: boolean;
  broadcast: boolean;
};

const jobs = new Map<string, Job>();
const TTL_MS = 12 * 60 * 1000;

function paused(reason: string): PublicVanityStatus {
  return { status: "paused", suffix: GPAY_MINT_SUFFIX, attempts: 0, elapsedMs: 0, publicKey: null, launchEnabled: false, submitted: false, reason };
}

function publish(job: Job): PublicVanityStatus {
  return { status: job.status, suffix: GPAY_MINT_SUFFIX, attempts: job.attempts, elapsedMs: job.elapsedMs, publicKey: job.publicKey, launchEnabled: false, submitted: false, reason: job.reason };
}

function sweep(now = Date.now()) {
  for (const [id, job] of jobs) {
    if (job.expiresAt > now) continue;
    job.controller?.abort();
    job.sealed?.destroy();
    jobs.delete(id);
  }
}

/** One in-process reservation. A second claim, a restart, or an expired job cannot sign again. */
export function claimReadyMint(jobId: string | null) {
  sweep();
  const job = jobId ? jobs.get(jobId) : undefined;
  if (!job || job.status !== "ready" || !job.sealed || job.claimed || job.broadcast) throw new Error("No unused gpay mint is ready");
  job.claimed = true;
  job.expiresAt = Date.now() + TTL_MS;
  job.reason = "This gpay mint is reserved for one launch attempt. Nothing has been submitted.";
  return job.sealed;
}

export function finishMintClaim(jobId: string | null, outcome: "unused" | "submitted") {
  const job = jobId ? jobs.get(jobId) : undefined;
  if (!job) return;
  if (outcome === "submitted") {
    job.broadcast = true;
    job.sealed?.destroy();
    job.sealed = null;
    job.reason = "This mint was submitted once. A restart cannot sign it again.";
    return;
  }
  if (!job.broadcast) job.claimed = false;
}

export function vanityStatus(jobId: string | null): PublicVanityStatus {
  sweep();
  if (!jobId) return { status: "idle", suffix: GPAY_MINT_SUFFIX, attempts: 0, elapsedMs: 0, publicKey: null, launchEnabled: false, submitted: false, reason: "No mint search is running." };
  const job = jobs.get(jobId);
  if (!job) return { status: "idle", suffix: GPAY_MINT_SUFFIX, attempts: 0, elapsedMs: 0, publicKey: null, launchEnabled: false, submitted: false, reason: "That mint search expired. You can start another." };
  return publish(job);
}

export function cancelVanitySearch(jobId: string | null) {
  const job = jobId ? jobs.get(jobId) : undefined;
  job?.controller?.abort();
  if (job && job.status === "searching") {
    job.status = "cancelled";
    job.reason = "Mint search cancelled. No token was launched.";
  }
  return vanityStatus(jobId);
}

export function startVanitySearch(env: NodeJS.ProcessEnv = process.env) {
  sweep();
  if (!vanitySearchAllowed(env)) {
    return { jobId: null as string | null, status: paused("Mint search is not running on this server. Mainnet launch submission is disabled, and a token will not be created without a mint ending in gpay.") };
  }
  const jobId = randomBytes(16).toString("hex");
  const controller = new AbortController();
  const job: Job = {
    status: "searching", suffix: GPAY_MINT_SUFFIX, attempts: 0, elapsedMs: 0, publicKey: null, launchEnabled: false, submitted: false,
    reason: "Searching for a mint address that ends in gpay. This usually takes several minutes.",
    sealed: null, controller, expiresAt: Date.now() + TTL_MS, claimed: false, broadcast: false,
  };
  jobs.set(jobId, job);
  void searchVanityMint({ suffix: GPAY_MINT_SUFFIX, signal: controller.signal, onProgress: progress => {
    if (job.status !== "searching") return;
    job.attempts = progress.attempts;
    job.elapsedMs = progress.elapsedMs;
  } }).then(sealed => {
    if (controller.signal.aborted) { sealed.destroy(); return; }
    job.sealed = sealed;
    job.publicKey = sealed.publicKey;
    job.expiresAt = Date.now() + TTL_MS;
    job.status = "ready";
    job.reason = "A gpay mint address is ready on this server. Its secret stays here until it expires. Nothing has been launched.";
  }).catch(error => {
    if (job.status === "cancelled") return;
    job.status = "failed";
    job.reason = error instanceof VanitySearchError && error.code === "cancelled" ? "Mint search cancelled. No token was launched." : "Mint search failed before a gpay address was found. You can retry. Nothing was launched.";
  });
  return { jobId, status: publish(job) };
}
