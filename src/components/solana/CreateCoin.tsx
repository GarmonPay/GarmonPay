"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Transaction } from "@solana/web3.js";

import { reviewWalletLaunch, reviewWalletResult } from "@/lib/solana/devnet-wallet-review";
import { coinJson, coinOperation, formatDevnetLaunchTime, validateCoinDraft } from "@/lib/solana/coin-launch-client";

type Stage = "idle" | "connecting" | "checking" | "preparing" | "review" | "awaiting" | "submitting" | "confirming" | "created";
type Costs = { cluster: string; simulationPassed: boolean; networkFeeLamports: number; estimatedRentLamports: number; priorityFeeLamports: number; applicationFeeLamports: number; estimatedTotalLamports: number };
type WalletProvider = {
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
};
type Created = {
  name: string;
  symbol: string;
  mint: string;
  signature: string;
  network: string;
  confirmationStatus: string;
  explorerTransaction: string;
  explorerMint: string;
  lamportsSpent: number;
  metadataStored: boolean;
  launchedAt?: string | null;
};

const labels: Record<Exclude<Stage, "idle">, string> = {
  connecting: "Connecting wallet…",
  checking: "Checking Devnet and simulating transaction…",
  preparing: "Preparing the Devnet transaction.",
  review: "Review Devnet costs",
  awaiting: "Awaiting wallet signature",
  submitting: "Submitting and confirming on Devnet…",
  confirming: "Confirming transaction",
  created: "Token created successfully",
};

function provider() {
  const wallets = window as unknown as { solana?: WalletProvider; solflare?: WalletProvider; backpack?: WalletProvider };
  return [wallets.solana, wallets.solflare, wallets.backpack].find(wallet => typeof wallet?.signTransaction === "function") ?? null;
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

type PreparedTx = Costs & { unsignedTransaction: string; kind: "platform" | "launch"; mint?: string; uri?: string; lastValidBlockHeight?: number; jobId?: string };

function sameReviewedCosts(reviewed: Costs, fresh: Costs) {
  return reviewed.cluster === "devnet" && fresh.cluster === "devnet" && reviewed.networkFeeLamports === fresh.networkFeeLamports && reviewed.estimatedRentLamports === fresh.estimatedRentLamports && fresh.priorityFeeLamports === 0 && fresh.applicationFeeLamports === 0;
}

function failureCode(cause: unknown) {
  return cause && typeof cause === "object" && "code" in cause && (cause as { code?: unknown }).code === "BLOCKHASH_EXPIRED" ? "BLOCKHASH_EXPIRED" : "";
}

async function post(body: Record<string, unknown>, signal?: AbortSignal) { return coinJson("/api/solana/launches/devnet", body, body.action === "submit" ? "submission" : "preparation", signal); }

export function CreateCoin() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", symbol: "", description: "", website: "", social: "", concept: "" });
  const [imageUrl, setImageUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const mintJob = useRef<string | null>(null);
  const mintOwner = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const search = useRef<AbortController | null>(null);
  const previewUrl = useRef("");
  const [review, setReview] = useState<(Costs & { kind: "platform" | "launch"; mint?: string }) | null>(null);
  const consent = useRef<((approved: boolean) => void) | null>(null);
  const launchBusy = useRef(false);
  const suggestionBusy = useRef(false);
  const reviewPanel = useRef<HTMLElement | null>(null);
  const active = stage !== "idle" && stage !== "created";
  useEffect(() => { if (review) { reviewPanel.current?.scrollIntoView({ behavior: "smooth", block: "center" }); reviewPanel.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }); } }, [review]);
  useEffect(() => () => { consent.current?.(false); search.current?.abort(); }, []);
  function edit(change: Partial<typeof form>) {
    setForm(current => ({ ...current, ...change }));
    setError("");
    setCreated(null);
  }

  async function suggest() {
    if (launchBusy.current || suggestionBusy.current) return;
    suggestionBusy.current = true;
    setSuggesting(true);
    setError("");
    try {
      const payload = await coinJson("/api/solana/launches/suggest", { concept: form.concept, name: form.name, symbol: form.symbol, description: form.description, fields: ["name", "symbol", "description"] }, "suggestion");
      const suggestion = Array.isArray(payload.suggestions) ? payload.suggestions[0] : payload.suggestion;
      if (!payload.available || !suggestion) {
        setError(payload.reason || payload.error || "Type the coin details yourself.");
        return;
      }
      const suggested = validateCoinDraft({ name: suggestion.name, symbol: suggestion.symbol, description: suggestion.description, website: "", social: "" });
      setForm(current => ({ ...current, name: suggested.name, symbol: suggested.symbol, description: suggested.description }));
      setCreated(null);
      setNote("AI suggestions added. Ready to launch; editing is optional.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Suggestion request failed. Try again or enter the details yourself.");
    } finally {
      suggestionBusy.current = false;
      setSuggesting(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Use a PNG, JPEG, or WebP image."); return; }
    if (file.size > 1_500_000) { setError("Use an image under 1.5 MB."); return; }
    if (!form.name.trim() || !form.symbol.trim() || !form.description.trim()) { setError("Add a name, ticker, and description before uploading an image."); return; }
    const local = URL.createObjectURL(file);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = local;
    setPreview(local);
    const body = new FormData();
    body.set("image", file);
    body.set("name", form.name);
    body.set("symbol", form.symbol.toUpperCase());
    body.set("description", form.description);
    const response = await fetch("/api/solana/launches/artwork", { method: "POST", body, credentials: "include" });
    const payload = await response.json();
    if (!response.ok || typeof payload.imageUrl !== "string") {
      setError(payload.error || "The image could not be saved.");
      return;
    }
    setImageUrl(payload.imageUrl);
    setNote("Image saved. It is hosted by GarmonPay and is not an immutable archive.");
  }

  async function signAndSubmit(wallet: WalletProvider, payload: PreparedTx, refresh: () => Promise<PreparedTx>) {
    if (payload.cluster !== "devnet" || payload.simulationPassed !== true || payload.priorityFeeLamports !== 0 || payload.applicationFeeLamports !== 0 || ![payload.networkFeeLamports, payload.estimatedRentLamports, payload.estimatedTotalLamports].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error("Verified Devnet preflight and costs are required before signing.");
    setStage("review"); setReview({ ...payload });
    let approved: boolean;
    try { approved = await coinOperation(() => new Promise<boolean>(resolve => { consent.current = resolve; }), "review", search.current?.signal, 60000); }
    finally { consent.current = null; setReview(null); }
    if (!approved) throw new Error("Cancelled before wallet signing. Nothing was submitted.");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      setStage("checking");
      const fresh = await refresh();
      if (!fresh.unsignedTransaction || !sameReviewedCosts(payload, fresh) || !Number.isSafeInteger(fresh.lastValidBlockHeight)) throw new Error("Devnet costs changed before signing. Nothing was submitted. Press Launch to review them again.");
      const transaction = Transaction.from(decodeBase64(fresh.unsignedTransaction));
      const reviewedMessage = reviewWalletLaunch(transaction, wallet.publicKey?.toString() ?? "", fresh.mint);
      setStage("awaiting");
      let signed: Transaction;
      try {
        signed = await coinOperation(() => wallet.signTransaction(transaction), "signature", search.current?.signal);
      } catch (cause) {
        throw new Error(cause instanceof Error && /timed out|Cancelled/.test(cause.message) ? cause.message : "Wallet signing was rejected or cancelled. Nothing was submitted.");
      }
      reviewWalletResult(signed, reviewedMessage);
      setStage("submitting");
      try {
        return await post({
          action: "submit",
          jobId: fresh.jobId,
          kind: fresh.kind,
          payer: signed.feePayer?.toBase58(),
          transaction: encodeBase64(signed.serialize()),
          lastValidBlockHeight: fresh.lastValidBlockHeight,
          mint: fresh.mint,
          uri: fresh.uri,
          name: form.name,
          symbol: form.symbol.toUpperCase(),
          description: form.description,
          website: form.website,
          social: form.social,
        }, search.current?.signal);
      } catch (cause) {
        if (attempt === 0 && failureCode(cause) === "BLOCKHASH_EXPIRED") {
          setNote("That Devnet blockhash expired before it was sent. Phantom needs to sign the same transaction with a new blockhash.");
          continue;
        }
        throw cause;
      }
    }
    throw new Error("The Devnet blockhash expired before the signed transaction was sent. Nothing was submitted.");
  }

  async function launch() {
    if (launchBusy.current || suggestionBusy.current) return;
    setError("");
    let draft: ReturnType<typeof validateCoinDraft>;
    try { draft = validateCoinDraft(form); } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the coin details."); return; }
    setCreated(null);
    const wallet = provider();
    if (!wallet) {
      setError("Connect Phantom, Solflare, or Backpack, then press Launch again.");
      return;
    }
    launchBusy.current = true;
    setStage("connecting"); setNote("");

    search.current?.abort();
    const controller = new AbortController();
    search.current = controller;
    try {
      const connected = await coinOperation(() => wallet.connect(), "connection", controller.signal);
      const payer = connected.publicKey.toString();
      setStage("checking");
      let status = await post({ action: "status", payer }, controller.signal);
      if (status.step === "platform") {
        if (payer !== status.requiredSigner) {
          throw new Error("The Devnet platform account still has to be created by the admin wallet. Switch to that wallet and press Launch.");
        }
        const platform = await signAndSubmit(wallet, { ...status, kind: "platform" }, async () => {
          const next = await post({ action: "status", payer }, controller.signal);
          return { ...next, kind: "platform" };
        });
        if (platform.confirmed !== true || platform.platformExists !== true) throw new Error(platform.error || "Devnet did not confirm the platform account.");
        setNote("Devnet confirmed the platform account. Preparing the token.");
        setStage("checking");
        status = await post({ action: "status", payer }, controller.signal);
      }
      if (status.step !== "mint") throw new Error("Devnet is not ready to create this token.");
      setStage("preparing");
      mintOwner.current = payer;
      const reservation = await post({ action: "mint-start", payer, draft, imageUrl }, controller.signal);
      if (reservation.status !== "ready" || typeof reservation.mint !== "string" || typeof reservation.jobId !== "string") {
        throw new Error(reservation.error || "The Devnet mint could not be prepared. Nothing was submitted.");
      }
      mintJob.current = reservation.jobId;
      setStage("checking");
      const prepared = await post({
        action: "prepare",
        payer,
        mint: reservation.mint,
        jobId: reservation.jobId,
        ...draft,
        imageUrl,
      }, controller.signal);
      if (!prepared.unsignedTransaction || prepared.cluster !== "devnet") throw new Error("The Devnet transaction could not be prepared. Nothing was submitted.");
      const result = await signAndSubmit(wallet, { ...prepared, kind: "launch", mint: reservation.mint, jobId: reservation.jobId }, async () => {
        const next = await post({
          action: "prepare",
          payer,
          mint: reservation.mint,
          jobId: reservation.jobId,
          ...draft,
          imageUrl,
        }, controller.signal);
        return { ...next, kind: "launch", mint: reservation.mint, jobId: reservation.jobId };
      });
      mintJob.current = null;
      if (result.confirmed !== true || result.confirmationStatus !== "finalized" || typeof result.signature !== "string" || typeof result.mint !== "string") {
        throw new Error(result.error || "Devnet did not confirm the token.");
      }
      window.dispatchEvent(new Event("garmonpay:coin-created"));
      setCreated(result);
      setStage("created");
      router.push(`/solana/token/${result.mint}`);
    } catch (cause) {
      setStage("idle");
      setError(cause instanceof Error ? cause.message : "The token was not created.");
    } finally {
      launchBusy.current = false;

      if (search.current === controller) search.current = null;
    }
  }

  return <form noValidate className="gp-sol-form gp-coin-creator" onSubmit={event => { event.preventDefault(); void launch(); }}>
    <p className="gp-sol-muted">Connect your wallet, enter the coin, then launch it on Solana Devnet. GarmonPay creates a new mint for this coin. The mint key stays on the server and is never shown. Mainnet is not used.</p>

    <label>Coin name
      <input disabled={active || suggesting} value={form.name} maxLength={32} required onChange={event => edit({ name: event.target.value })} />
    </label>
    <label>Ticker
      <input disabled={active || suggesting} value={form.symbol} maxLength={10} required autoCapitalize="characters" onChange={event => edit({ symbol: event.target.value.toUpperCase() })} />
    </label>
    <label>Description
      <textarea disabled={active || suggesting} value={form.description} maxLength={2000} required rows={4} onChange={event => edit({ description: event.target.value })} />
    </label>
    <label>Image
      <input disabled={active || suggesting} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
    </label>
    {preview || imageUrl ? <img className="gp-token-art" src={preview || imageUrl} alt="" width={96} height={96} /> : null}
    <label>Website <span className="gp-sol-muted">optional</span>
      <input disabled={active || suggesting} value={form.website} maxLength={200} placeholder="https://" onChange={event => edit({ website: event.target.value })} />
    </label>
    <label>Social link <span className="gp-sol-muted">optional</span>
      <input disabled={active || suggesting} value={form.social} maxLength={200} placeholder="https://" onChange={event => edit({ social: event.target.value })} />
    </label>
    <details>
      <summary>AI Coin Creator</summary>
      <label>Coin idea
        <textarea disabled={active || suggesting} value={form.concept} maxLength={280} rows={3} placeholder="A golden lion in a royal purple crown" onChange={event => edit({ concept: event.target.value })} />
      </label>
      <button type="button" className="gp-button" disabled={suggesting || active} onClick={() => void suggest()}>{suggesting ? "Writing…" : "Suggest name, ticker, and description"}</button>
    </details>
    <p className="gp-fee-note">Devnet SOL pays the rent and network fee. Your wallet shows the exact amount before you approve. GarmonPay does not add a launch fee. A later buy or sell on this curve would include a 1.20% platform fee, a 0.30% creator fee, and a 0.25% protocol fee. <Link href="/solana/fees">Fees</Link></p>
    {review && <section ref={reviewPanel} className="gp-sol-readiness" aria-label="Review Devnet transaction costs">
      <h3>{review.kind === "platform" ? "One-time Devnet platform setup" : "Create your Devnet token"}</h3>
      <p>Solana Devnet only. Set Phantom to Testnet Mode / Devnet. These are test SOL costs, not Mainnet SOL.</p>
      {review.kind === "launch" && review.mint ? <p>Mint address <code style={{ overflowWrap: "anywhere" }}>{review.mint}</code></p> : null}
      <p>Network fee: {review.networkFeeLamports / 1e9} Devnet SOL. Estimated account rent: {review.estimatedRentLamports / 1e9} Devnet SOL. Priority fee: 0. GarmonPay fee: 0.</p>
      <p>{review.kind === "platform" ? "Rent funds the Raydium platform configuration account; this does not create a token." : "Rent funds the token mint, LaunchLab pool, vaults and metadata accounts."} No purchase, trading instruction or direct SOL transfer is included. Account creation may debit rent through the LaunchLab program. After you continue, Phantom signs a freshly built Devnet transaction. If that blockhash expires before it is sent, Phantom asks once for a new signature. An expired transaction is not resubmitted.</p>
      <button type="button" className="gp-button gp-button-gold" onClick={() => consent.current?.(true)}>Review in wallet — Devnet only</button>
      <button type="button" className="gp-button" onClick={() => consent.current?.(false)}>Cancel</button>
    </section>}
    <button className="gp-button gp-button-gold" disabled={active || suggesting}>{active ? stage === "review" ? "Review Devnet costs above" : labels[stage as Exclude<Stage, "idle">] : "Launch"}</button>
    {stage !== "idle" ? <p role="status">{labels[stage]}</p> : null}
    {["connecting", "checking", "preparing", "awaiting"].includes(stage) ? <button type="button" className="gp-button" onClick={() => { search.current?.abort(); if (mintJob.current && mintOwner.current) { void post({ action: "mint-cancel", payer: mintOwner.current, jobId: mintJob.current }).catch(() => setError("Cancellation could not reach the server. Nothing was submitted by this page.")); mintJob.current = null; } }}>Cancel</button> : null}
    {note ? <p className="gp-sol-muted" role="status">{note}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {created ? <section aria-label="Created token">
      <h2>{created.name} · {created.symbol}</h2>
      <p>Mint address <code>{created.mint}</code></p>
      <p>Network {created.network}</p>
      <p>Status {created.confirmationStatus}</p>
      {created.launchedAt ? <p>Launched {formatDevnetLaunchTime(created.launchedAt)}</p> : null}
      <p>Devnet SOL spent {(created.lamportsSpent / 1_000_000_000).toFixed(9)}</p>
      <p>{created.metadataStored ? "The token metadata account includes this name." : "The mint account exists. Metadata text was not found."}</p>
      <p><Link href="/solana/launchpad">View on Launchpad</Link> · <Link href="/solana/dashboard#my-coins">View My Coins</Link></p>
      <p><a href={created.explorerTransaction} target="_blank" rel="noopener noreferrer">View the transaction</a></p>
      <p><a href={created.explorerMint} target="_blank" rel="noopener noreferrer">View the mint</a></p>
    </section> : null}
  </form>;
}
