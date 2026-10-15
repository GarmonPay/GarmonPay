import { mintWorker } from "@/lib/solana/mint-worker-client";
import { HOSTED_MINT_COOKIE, metadataHash, mintSealKey, runHostedMint } from "@/lib/solana/hosted-mint";
import { devnetMintLanded, markInventorySubmission, recordLaunchMint, releaseInventoryMint } from "@/lib/solana/mint-inventory";
import { getSolanaSession } from "@/lib/solana/session";
import { devnetLaunchNotSent } from "@/lib/solana/devnet-completion";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DEV_LAUNCHPAD_PROGRAM, LaunchpadPool, getPdaMetadataKey } from "@raydium-io/raydium-sdk-v2";
import { json, smallJson, trustedBrowserOrigin, cookieOptions, walletCookieOptions } from "@/lib/solana/http";
import { checkRateLimit, getClientIp, rateLimitOr429 } from "@/lib/rate-limit";
import { validateTokenMetadata } from "@/lib/solana/token-metadata";
import { isDraftId, isStoredArtworkUrl, readTokenArtwork, writeLaunchMetadata } from "@/lib/solana/artwork-store";
import { authOrigin } from "@/lib/solana/auth-crypto";
import { submitSignedPlatformTransaction } from "@/lib/solana/platform-submit";
import { CLUSTER_GENESIS } from "@/lib/solana/platform-setup";
import { afterDevnetBroadcast, DevnetSubmissionError } from "@/lib/solana/devnet-submission";
import { DevnetBlockhashError, sendExactSignedTransaction } from "@/lib/solana/devnet-blockhash";
import {
  assertDevnetCluster, assertSignedDevnetLaunch, buildDevnetLaunchTransaction, DEVNET_TEST_SUPPLY, metadataUri, prepareDevnetCoin, readDevnetLaunchContext,
} from "@/lib/solana/devnet-coin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const COOKIE = "gp-token-draft";

function blockhashHeight(body: Record<string, unknown>) {
  const height = body.lastValidBlockHeight;
  if (typeof height !== "number" || !Number.isSafeInteger(height) || height < 0) throw new DevnetBlockhashError("Devnet blockhash expiry is missing. Nothing was submitted.", "BLOCKHASH_REJECTED");
  return height;
}

function rememberMint(response: ReturnType<typeof json>, cookie?: string) {
  if (cookie === undefined || process.env.GARMONPAY_MINT_WORKER_URL) return response;
  response.cookies.set(HOSTED_MINT_COOKIE, cookie, { ...walletCookieOptions, path: "/api/solana/launches/devnet", maxAge: cookie ? 45 * 60 : 0 });
  return response;
}

async function hosted(action: string, owner: string, body: Record<string, unknown>, cookie: string | undefined) {
  try {
    const draft = body.draft && typeof body.draft === "object" ? body.draft as Record<string, unknown> : body;
    if (action === "submit" && typeof body.jobId === "string") {
      await markInventorySubmission(body.jobId, owner, "submitting", undefined, typeof body.lastValidBlockHeight === "number" ? body.lastValidBlockHeight : undefined);
    }
    const mintInput = {
      action, owner, cookie, jobId: typeof body.jobId === "string" ? body.jobId : undefined,
      draft, imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : "",
      uri: typeof body.uri === "string" ? body.uri : undefined,
      transaction: typeof body.transaction === "string" ? body.transaction : undefined,
      lastValidBlockHeight: typeof body.lastValidBlockHeight === "number" ? body.lastValidBlockHeight : undefined,
    };
    let outcome = await runHostedMint(mintInput, mintSealKey());
    const blocked = outcome.body as { error?: unknown; mint?: unknown; result?: unknown };
    if (action === "start" && outcome.status === 409 && typeof blocked.error === "string" && blocked.error.includes("still being confirmed")) {
      const stuckMint = typeof blocked.mint === "string" ? blocked.mint : "";
      const stuckResult = blocked.result;
      const stuckSignature = stuckResult && typeof stuckResult === "object" && "signature" in stuckResult && typeof stuckResult.signature === "string" ? stuckResult.signature : undefined;
      if (stuckMint && !(await devnetMintLanded(stuckMint, stuckSignature))) {
        outcome = await runHostedMint({ ...mintInput, replaceUnconfirmed: true }, mintSealKey());
      }
    }
    if (action === "start" && outcome.status === 200) {
      const ready = outcome.body as { status?: unknown; jobId?: unknown; mint?: unknown };
      if (ready.status === "ready" && typeof ready.jobId === "string" && typeof ready.mint === "string") {
        const metadata = validateTokenMetadata(draft);
        await recordLaunchMint({
          id: ready.jobId,
          mint: ready.mint,
          wallet: owner,
          draftHash: metadataHash(metadata),
          imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : "",
          name: metadata.name,
          symbol: metadata.symbol,
        });
      }
    }
    if (action === "cancel" && typeof body.jobId === "string") await releaseInventoryMint(body.jobId, owner);
    if (action === "submit" && typeof body.jobId === "string") {
      const signature = typeof (outcome.body as { signature?: unknown }).signature === "string" ? (outcome.body as { signature: string }).signature : undefined;
      const sent = outcome.status === 200 || (outcome.body as { submitted?: unknown }).submitted === true;
      await markInventorySubmission(body.jobId, owner, outcome.status === 200 ? "consumed" : sent ? "uncertain" : "reserved", signature, typeof body.lastValidBlockHeight === "number" ? body.lastValidBlockHeight : undefined);
    }
    return rememberMint(json(outcome.body, outcome.status), outcome.cookie);
  } catch (error) {
    const cookieValue = error && typeof error === "object" && "mintCookie" in error && typeof (error as { mintCookie?: unknown }).mintCookie === "string" ? (error as { mintCookie: string }).mintCookie : undefined;
    if (action === "submit" && typeof body.jobId === "string") {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";
      await markInventorySubmission(body.jobId, owner, devnetLaunchNotSent(code) ? "reserved" : "uncertain");
    }
    return rememberMint(fail(error), cookieValue);
  }
}

function fail(error: unknown, status = 400) {
  if (error instanceof DevnetBlockhashError) return json({ error: error.message, code: error.code, submitted: false, confirmed: false, cluster: "devnet", ...error.diagnostics }, 409);
  if (error instanceof DevnetSubmissionError) return json({ error: error.message, code: "SUBMISSION_UNCERTAIN", submitted: true, confirmed: false, cluster: "devnet", signature: error.signature, rpc: "https://api.devnet.solana.com", explorerTransaction: `https://explorer.solana.com/tx/${error.signature}?cluster=devnet` }, 409);
  const message = error instanceof Error ? error.message : "Devnet token creation did not finish";
  return json({ error: message.replace(/[1-9A-HJ-NP-Za-km-z]{80,}/g, "[redacted]").slice(0, 220), submitted: false, confirmed: false, cluster: "devnet" }, status);
}

export async function POST(request: Request) {
  assertDevnetCluster("devnet");
  if (!trustedBrowserOrigin(request)) return json({ error: "Origin rejected", submitted: false, confirmed: false }, 403);
  const limited = rateLimitOr429(request, "solana-devnet-coin", 90);
  if (limited) return limited;
  try {
    const body = await smallJson(request);
    const action = typeof body.action === "string" ? body.action : "status";
    const payer = typeof body.payer === "string" ? body.payer : "";
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(payer)) return json({ error: "Connect a wallet before creating a coin.", submitted: false, confirmed: false }, 400);
    if (action === "status") return json(await prepareDevnetCoin({ payer }));
    const session = await getSolanaSession();
    if (!session || session.wallet !== payer) return json({ error: "Sign in as the connected wallet before launching. Your coin details are preserved." }, 401);
    const remoteWorker = Boolean(process.env.GARMONPAY_MINT_WORKER_URL);
    const mintCookie = (await cookies()).get(HOSTED_MINT_COOKIE)?.value;
    if (!remoteWorker && action === "mint-start") {
      const budget = checkRateLimit(getClientIp(request), "solana-hosted-mint-start", 6, 10 * 60 * 1000);
      if (!budget.allowed) return json({ error: "Too many launch attempts. Wait a few minutes. Your coin details are preserved." }, 429);
    }
    if (["mint-start", "mint-status", "mint-cancel", "mint-resume", "mint-current"].includes(action)) {
      if (!remoteWorker) return await hosted(action.slice(5), session.wallet, body, mintCookie);
      const result = await mintWorker({ action: action.slice(5), owner: session.wallet, jobId: body.jobId, draft: body.draft, imageUrl: body.imageUrl });
      return json(result);
    }
    if (action === "prepare") return remoteWorker ? json(await prepareLaunch(body, payer)) : await prepareHosted(body, payer, mintCookie);
    const transaction = typeof body.transaction === "string" ? body.transaction : "";
    if (body.kind === "platform") {
      const result = await submitSignedPlatformTransaction(transaction, blockhashHeight(body));
      return json({ ...result, cluster: "devnet", kind: "platform" });
    }
    if (typeof body.jobId !== "string") throw new Error("A secure mint reservation is required. Prepare the launch again.");
    if (!remoteWorker) return await hosted("submit", session.wallet, body, mintCookie);
    return json(await mintWorker({ action: "submit", owner: session.wallet, jobId: body.jobId, transaction, lastValidBlockHeight: blockhashHeight(body) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = /required|invalid|suffix|wallet|ticker|metadata|separate|public address|JSON|too large/i.test(message) ? 400 : /not been created|not confirmed|did not finalize/i.test(message) ? 409 : 503;
    return fail(error, status);
  }
}

async function prepareHosted(body: Record<string, unknown>, payer: string, cookie: string | undefined) {
  if (typeof body.jobId !== "string" || !/^[a-f0-9]{32}$/.test(body.jobId)) throw new Error("A secure mint reservation is required");
  const key = mintSealKey();
  const looked = await runHostedMint({ action: "status", owner: payer, cookie, jobId: body.jobId, draft: body, maxSliceMs: 0 }, key);
  const reservation = looked.body as Record<string, unknown>;
  if (looked.status !== 200 || reservation.status !== "ready" || typeof reservation.mint !== "string") return rememberMint(json(reservation, looked.status), looked.cookie);
  const metadata = validateTokenMetadata(body);
  if (reservation.draftHash !== metadataHash(body)) throw new Error("Coin details changed after mint reservation. Cancel the reservation before changing details.");
  const imageUrl = typeof reservation.imageUrl === "string" ? reservation.imageUrl : "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (imageUrl && supabaseUrl && !isStoredArtworkUrl(imageUrl, supabaseUrl)) throw new Error("Upload the image before launching");
  await writeLaunchMetadata(body.jobId, { ...metadata, imageUrl: imageUrl || undefined });
  const uri = metadataUri(body.jobId);
  if (!uri.startsWith(authOrigin())) throw new Error("Token metadata address is invalid");
  const prepared = await runHostedMint({ action: "prepare", owner: payer, cookie: looked.cookie, jobId: body.jobId, draft: body, uri }, key);
  return rememberMint(json({ ...(prepared.body as Record<string, unknown>), name: metadata.name, symbol: metadata.symbol, description: metadata.description }, prepared.status), prepared.cookie);
}

async function prepareLaunch(body: Record<string, unknown>, payer: string) {
  if (typeof body.jobId !== "string" || !/^[a-f0-9]{32}$/.test(body.jobId)) throw new Error("A secure mint reservation is required");
  const reservation = await mintWorker({ action: "status", owner: payer, jobId: body.jobId });
  const metadata = validateTokenMetadata(reservation.draft);
  if (JSON.stringify(metadata) !== JSON.stringify(validateTokenMetadata(body))) throw new Error("Coin details changed after mint reservation. Cancel the reservation before changing details.");
  const existing = (await cookies()).get(COOKIE)?.value ?? "";
  const saved = isDraftId(existing) ? await readTokenArtwork(existing).catch(() => null) : null;
  const requested = typeof reservation.imageUrl === "string" ? reservation.imageUrl : "";
  const imageUrl = requested;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (imageUrl && supabaseUrl && !isStoredArtworkUrl(imageUrl, supabaseUrl)) throw new Error("Upload the image before launching");
  const id = body.jobId;
  await writeLaunchMetadata(id, { ...metadata, imageUrl: imageUrl || undefined });

  const uri = metadataUri(id);
  if (!uri.startsWith(authOrigin())) throw new Error("Token metadata address is invalid");
  if (typeof body.jobId !== "string") throw new Error("A secure mint reservation is required");
  const prepared = await mintWorker({ action: "prepare", owner: payer, jobId: body.jobId, uri });
  return { ...prepared, name: metadata.name, symbol: metadata.symbol, description: metadata.description };
}

