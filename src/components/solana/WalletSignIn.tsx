"use client";
import { useEffect, useRef, useState } from "react";
import { classifySessionResponse } from "@/lib/solana/session-client";
import { walletAuthEnabled } from "@/lib/solana/policy";
import { reviewBrowserChallenge } from "@/lib/solana/browser-challenge";
import { reportAuthEvent, uaFamily } from "@/lib/solana/auth-event";
import { AUTH_STAGE_ERRORS, inAppDecision, pollProvider, PROVIDER_READY_EVENTS, signedInNotice } from "@/lib/solana/in-app-sign-in";
import { addressFromConnect, connectWithDeadline, signWithDeadline, walletSignature, type WalletProvider as Provider } from "@/lib/solana/wallet-provider";
import { connectPlan, connectionMode, installUrl, walletSurface, type WalletApp, type WalletSurface } from "@/lib/solana/wallet-environment";
import { announceAppReady, currentProviders, insideWalletBrowser, rememberInApp, rememberedInApp, walletErrorText, walletLog, type WalletHost } from "@/lib/solana/wallet-discovery";
import { browseLink, clearMobileSession, connectLink, createLinkKeyPair, encodeBase58, handoffPage, loadMobileSession, memberRedirect, mobileRedirect, openJson, readWalletReturn, saveMobileSession, sealJson, sharedSecret, signMessageLink, signatureBase64, walletHint, walletReferrer, type WalletReturn } from "@/lib/solana/wallet-deeplink";

import { confirmWalletSession } from "@/lib/solana/wallet-session-confirmation";

import { AUTH_NETWORKS, type AuthNetwork } from "@/lib/solana/auth-chain";

const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
type ChallengeBody = { challengeId?: string; message?: string; expiresAt?: string; error?: string };
type HeldChallenge = { wallet: string; network: string; body: ChallengeBody };
let signInFlight = false;
let heldChallenge: HeldChallenge | null = null;

/** One active challenge per wallet and network. A rejected signature reuses it instead of requesting another. */
async function requestChallenge(wallet: string, network: string): Promise<{ ok: true; body: ChallengeBody } | { ok: false; status: number; error: string }> {
  const held = heldChallenge;
  const remaining = held ? Date.parse(held.body.expiresAt || "") - Date.now() : 0;
  if (held && held.wallet === wallet && held.network === network && remaining > 20000 && held.body.challengeId && held.body.message) return { ok: true, body: held.body };
  const challenge = await fetch("/api/solana/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet, network }) });
  const data = await challenge.json().catch(() => ({})) as ChallengeBody;
  if (!challenge.ok) return { ok: false, status: challenge.status, error: typeof data.error === "string" ? data.error : "Sign-in challenge failed." };
  heldChallenge = { wallet, network, body: data };
  return { ok: true, body: data };
}
const BACKPACK_SITE = "https://backpack.app";
function seen(found: ReturnType<typeof currentProviders>) {
  return { phantom: !!found.phantom, solflare: !!found.solflare, backpack: !!found.backpack };
}
function emitAuthEvent(stage: string, ok: boolean, fields: { code?: string; providerFound?: boolean; insideWallet?: boolean; hasHint?: boolean; elapsedMs?: number }) {
  try {
    reportAuthEvent({ stage, ok, code: fields.code ?? "", uaFamily: uaFamily(typeof navigator === "undefined" ? "" : navigator.userAgent), insideWallet: fields.insideWallet === true, hasHint: fields.hasHint === true, providerFound: fields.providerFound === true, elapsedMs: fields.elapsedMs ?? 0 });
  } catch { /* diagnostics must not block sign-in */ }
}

export function WalletSignIn() {
  const [wallet, setWallet] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState(""), [stage, setStage] = useState("idle");
  const [choice, setChoice] = useState<WalletApp | "backpack">("phantom"), [surface, setSurface] = useState<WalletSurface>("desktop");
  const [injected, setInjected] = useState({ phantom: false, solflare: false, backpack: false }), [insideWallet, setInsideWallet] = useState(false);
  const [others, setOthers] = useState<{ name: string; key: string; provider: Provider }[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [extra, setExtra] = useState<Provider | null>(null), [extraName, setExtraName] = useState("");
  const [network,setNetwork] = useState<AuthNetwork>("mainnet");
  const generation = useRef(0), sessionWallet = useRef<string | null>(null), signing = useRef(false), authContext = useRef({ insideWallet: false, hasHint: false, startedAt: 0 });
  useEffect(() => { sessionWallet.current = wallet; }, [wallet]);
  useEffect(() => () => { generation.current++; }, []);

  useEffect(() => {
    if (!walletAuthEnabled()) return;
    let active = true;
    const current = generation.current;
    const agent = navigator.userAgent;
    setSurface(walletSurface(agent));
    const referral = new URLSearchParams(window.location.search).get("ref");
    const hint = walletHint(window.location.search);
    if (hint) rememberInApp(window.sessionStorage, hint);
    const returned = readWalletReturn(window.location.search);
    const callbackState = new URLSearchParams(window.location.search).get("gp_state");
    const callbackSession = loadMobileSession(window.sessionStorage, window.localStorage, callbackState);
    const inside = insideWalletBrowser(window, agent, hint ?? rememberedInApp(window.sessionStorage));
    setInsideWallet(inside);
    if (returned.kind !== "none" || hint) window.history.replaceState(null, "", memberRedirect(window.location.origin, window.location.pathname, referral));
    announceAppReady(window);
    const found = currentProviders(window);
    setInjected(seen(found)); setOthers(found.others);
    const referrerApp = walletReferrer(document.referrer);
    const surfaceNow = walletSurface(agent);
    const trackedInside = inside || !!referrerApp;
    if (trackedInside) setInsideWallet(true);
    const startedAt = Date.now();
    authContext.current = { insideWallet: trackedInside, hasHint: !!hint, startedAt };
    const emit = (stage: string, ok: boolean, extra?: { code?: string; providerFound?: boolean }) => emitAuthEvent(stage, ok, { code: extra?.code, providerFound: extra?.providerFound, insideWallet: trackedInside, hasHint: !!hint, elapsedMs: Date.now() - startedAt });
    emit("page-load", true, { providerFound: !!(found.phantom || found.solflare) });
    emit("hint-read", true, { providerFound: !!(found.phantom || found.solflare) });
    void fetch("/api/solana/auth/session", { cache: "no-store" }).then(response => response.json()).then(session => { if (active && generation.current === current && typeof session.wallet === "string") { sessionWallet.current = session.wallet; setWallet(session.wallet); } }).catch(() => {});
    let releaseWait = () => {};
    const onProviderReady = () => releaseWait();
    for (const eventName of PROVIDER_READY_EVENTS) window.addEventListener(eventName, onProviderReady);
    if (returned.kind === "declined") { clearMobileSession(window.sessionStorage, window.localStorage); setError("The wallet request was declined. No account was changed."); }
    else if (returned.kind !== "none" && callbackSession?.secretKey) void completeMobileReturn(returned, referral, callbackSession!);
    else if (returned.kind !== "none") { walletLog("callback-context-missing"); setStage("return-context"); setError("Wallet return [RETURN_CONTEXT]: return to the Safari browser that started sign-in and retry. This browser has no matching active request."); }
    else void watchProvider();
    return () => { active = false; releaseWait(); for (const eventName of PROVIDER_READY_EVENTS) window.removeEventListener(eventName, onProviderReady); };

    async function watchProvider() {
      let outside = false;
      const outcome = await pollProvider({
        read: () => {
          const next = currentProviders(window);
          const providerFound = !!next.phantom || !!next.solflare;
          if (active) { setInjected(seen(next)); setOthers(next.others); }
          emit("provider-check", providerFound, { providerFound });
          const decision = inAppDecision({ hint, insideWallet: trackedInside, surface: surfaceNow, phantom: !!next.phantom, solflare: !!next.solflare, hasSession: !!sessionWallet.current });
          emit("resume-decision", decision !== "wait", { code: decision, providerFound });
          if (decision === "none") { outside = true; return { phantom: false, solflare: false }; }
          if (decision === "sign-phantom" || decision === "sign-solflare") {
            setChoice(decision === "sign-phantom" ? "phantom" : "solflare");
            setInsideWallet(true);
            setStage("ready");
            setStatus("");
            return { phantom: decision === "sign-phantom", solflare: decision === "sign-solflare" };
          }
          setStage("wait");
          setStatus(hint === "solflare" ? "Waiting for Solflare's wallet…" : "Waiting for Phantom's wallet…");
          return { phantom: false, solflare: false };
        },
        wait: (ms) => new Promise(resolve => {
          const timer = window.setTimeout(() => { releaseWait = () => {}; resolve(); }, ms);
          releaseWait = () => { window.clearTimeout(timer); releaseWait = () => {}; resolve(); };
        }),
        shouldStop: () => !active || generation.current !== current || !!sessionWallet.current || outside,
      });
      if (!active || generation.current !== current || sessionWallet.current || outside) return;
      if (outcome === "timeout") {
        setStage("provider-timeout");
        setError(AUTH_STAGE_ERRORS.provider);
        emit("provider-timeout", false, { code: "TIMEOUT", providerFound: false });
      }
    }

    async function completeMobileReturn(result: WalletReturn, referralCode: string | null, saved: NonNullable<ReturnType<typeof loadMobileSession>>) {
      if (signInFlight) return;
      signInFlight = true;
      signing.current = true; setBusy(true); setStage("callback"); setStatus("Completing wallet sign-in…");
      walletLog(result.kind === "connect" ? "callback-connect" : "callback-signed", { app: saved.app });
      const storage = window.sessionStorage;
      try {
        if (result.kind !== "connect" && result.kind !== "signed") return;
        if (!saved?.secretKey) throw new Error("Press Connect & sign in on this screen. The earlier request was opened in a different browser.");
        const peer = result.kind === "connect" ? result.peerPublicKey : saved.peerPublicKey;
        if (!peer) throw new Error("Press Connect & sign in on this screen. The earlier request was opened in a different browser.");
        const secret = sharedSecret(peer, saved.secretKey);
        const payload = openJson(result.data, result.nonce, secret);
        walletLog("callback-decrypted", { app: saved.app });
        const redirect = mobileRedirect(window.location.origin, window.location.pathname, referralCode, saved.state!);
        if (result.kind === "connect") {
          const address = payload.public_key, session = payload.session;
          if (typeof address !== "string" || !addressPattern.test(address) || typeof session !== "string") throw new Error("The wallet did not return an address.");
          const challenge = await requestChallenge(address, saved.network ?? "mainnet");
          walletLog("challenge-response", { httpStatus: challenge.ok ? 200 : challenge.status });
          if (!challenge.ok) throw new Error(challenge.error);
          const data = challenge.body;
          const reviewed = reviewBrowserChallenge(data, address, window.location.origin, Date.now(), saved.network ?? "mainnet");
          setStage("sign-link"); setStatus("Connection approved. Approve the separate sign-in message in your wallet.");
          const sealed = sealJson({ message: encodeBase58(new TextEncoder().encode(reviewed.message)), session, display: "utf8" }, secret);
          saveMobileSession(storage, window.localStorage, { ...saved, peerPublicKey: peer, wallet: address, session, challengeId: reviewed.challengeId });
          walletLog("sign-request", { method: "deeplink/signMessage", cluster: AUTH_NETWORKS[saved.network ?? "mainnet"].cluster, messageChain: saved.network ?? "mainnet" });
          window.location.assign(signMessageLink(saved.app, { dappPublicKey: saved.publicKey, nonce: sealed.nonce, redirectLink: redirect, payload: sealed.payload }));
          return;
        }
        setStage("verify"); setStatus("Verifying your signed message…");
        if (typeof payload.signature !== "string" || !saved.wallet || !saved.challengeId) throw new Error("The sign-in response was incomplete.");
        const verified = await fetch("/api/solana/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: saved.challengeId, signature: signatureBase64(payload.signature), referralCode }) });
        const session = await verified.json();
        walletLog("verify-response", { httpStatus: verified.status });
        if (!verified.ok) throw new Error(`${session.error || "Authentication failed"} [${session.code || "HTTP_" + verified.status}]`);
        if (session.wallet !== saved.wallet) { await fetch("/api/solana/auth/logout", { method: "POST" }); throw new Error("Wallet changed during verification. Please retry."); }
        await confirmWalletSession(session.wallet);
        heldChallenge = null;
        walletLog("session-confirmed", { app: saved.app });
        clearMobileSession(storage, window.localStorage);
        if (active && current === generation.current) { setWallet(session.wallet); setStatus(""); setStage("done"); window.dispatchEvent(new Event("garmonpay-session-change")); }
      } catch (exception) {
        clearMobileSession(storage, window.localStorage);
        if (active && current === generation.current) { setError(`Wallet return [${result.kind.toUpperCase()}]: ${walletErrorText(exception)}`); setStatus(""); setStage("error"); }
      } finally { signInFlight = false; signing.current = false; if (active && current === generation.current) setBusy(false); }
    }
  }, []);

  useEffect(() => {
    if (!walletAuthEnabled()) return;
    // The verified cookie owns membership. Extension transport disconnects (including
    // page reloads) must not revoke it; only explicit Disconnect/Switch Wallet does.
    const timer = setInterval(() => {
      const current = generation.current;
      void fetch("/api/solana/auth/session", { cache: "no-store", credentials: "same-origin" }).then(async response => {
        const read = classifySessionResponse(response.status, await response.json().catch(() => null));
        if (current !== generation.current || signing.current || read.state === "temporary") return;
        const next = read.state === "active" ? read.wallet : null;
        if (next !== sessionWallet.current) { generation.current++; setWallet(next); window.dispatchEvent(new Event("garmonpay-session-change")); }
      }).catch(() => {});
    }, 60000);
    return () => { clearInterval(timer); };
  }, []);

  async function runInjectedSignIn(provider: Provider, current: number, app: WalletApp) {
    const walletName = extra || choice === "backpack" ? (extraName || "Backpack") : app === "phantom" ? "Phantom" : "Solflare";
    signing.current = true;
    setBusy(true); setError(""); setStage("connect"); setStatus(`Connecting to ${walletName}…`);
    const ctx = authContext.current;
    const emit = (stage: string, ok: boolean, code = "") => emitAuthEvent(stage, ok, { code, providerFound: true, insideWallet: ctx.insideWallet, hasHint: ctx.hasHint, elapsedMs: ctx.startedAt ? Date.now() - ctx.startedAt : 0 });
    emit("connect-start", true);
    try {
      let connected = "";
      try { connected = addressFromConnect(await connectWithDeadline(provider), provider); emit("connect-ok", true); }
      catch (exception) { const code = exception && typeof exception === "object" && "code" in exception ? String((exception as { code: unknown }).code) : "CONNECT"; emit("connect-fail", false, code); throw new Error(`${AUTH_STAGE_ERRORS.connect} ${walletErrorText(exception)}`); }
      if (current !== generation.current) throw new Error("Wallet changed during sign-in. Please retry.");
      setStage("challenge"); setStatus("Preparing the sign-in message…");
      const challenge = await requestChallenge(connected, network);
      if (!challenge.ok) { emit("challenge-fail", false, "HTTP_" + challenge.status); throw new Error(challenge.error); }
      const data = challenge.body;
      emit("challenge-ok", true, "HTTP_200");
      if (current !== generation.current) throw new Error("Wallet changed during sign-in. Please retry.");
      const reviewed = reviewBrowserChallenge(data, connected, window.location.origin, Date.now(), network);
      setStage("sign"); setStatus(`Approve the sign-in in ${walletName}. This does not authorize a transfer.`);
      walletLog("sign-request", { method: "signMessage", walletApiChain: "none (API takes message bytes)", messageChain: network });
      emit("sign-start", true);
      let bytes: Uint8Array;
      try { bytes = walletSignature(await signWithDeadline(provider, new TextEncoder().encode(reviewed.message))); emit("sign-ok", true); }
      catch (exception) { const code = exception && typeof exception === "object" && "code" in exception ? String((exception as { code: unknown }).code) : "SIGN"; emit("sign-fail", false, code); if (code === "-32000") throw new Error("Phantom rejected the sign-in message before asking for approval. Try once. No transaction is requested."); throw new Error(`${AUTH_STAGE_ERRORS.sign} ${walletErrorText(exception)}`); }
      if (current !== generation.current) throw new Error("Wallet changed during sign-in. Please retry.");
      if (provider.publicKey && provider.publicKey.toString() !== connected) throw new Error("Wallet changed during signing. Please retry.");
      const signature = btoa(String.fromCharCode(...Array.from(bytes)));
      setStage("verify"); setStatus("Checking the signature…");
      const referralCode = new URLSearchParams(window.location.search).get("ref");
      const verified = await fetch("/api/solana/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: reviewed.challengeId, signature, referralCode }) });
      const session = await verified.json();
      if (!verified.ok) { heldChallenge = null; emit("verify-fail", false, "HTTP_" + verified.status); throw new Error(`${AUTH_STAGE_ERRORS.verify} ${session.error || "Authentication failed."}`); }
      emit("verify-ok", true, "HTTP_" + verified.status);
      if (current !== generation.current || session.wallet !== connected) { await fetch("/api/solana/auth/logout", { method: "POST" }); throw new Error("Wallet changed during verification. Please retry."); }
      heldChallenge = null;
      try { await confirmWalletSession(connected); emit("session-ok", true); }
      catch (exception) { emit("session-fail", false, "SESSION"); throw new Error(`${AUTH_STAGE_ERRORS.session} ${walletErrorText(exception)}`); }
      const profile = await fetch("/api/solana/members/me", { cache: "no-store" });
      if (!profile.ok) { emit("profile-fail", false, "HTTP_" + profile.status); throw new Error(AUTH_STAGE_ERRORS.profile); }
      emit("profile-ok", true);
      setWallet(session.wallet); setStatus(choice === "phantom" && !extra ? signedInNotice(app, true) : "Signed in."); setStage("done");
      window.dispatchEvent(new Event("garmonpay-session-change"));
    } finally {
      signing.current = false;
      if (current === generation.current) setBusy(false);
    }
  }

  async function act() {
    if (!walletAuthEnabled() || signInFlight) return;
    signInFlight = true;
    const current = ++generation.current;
    const walletName = extra ? extraName : choice === "phantom" ? "Phantom" : choice === "solflare" ? "Solflare" : "Backpack";
    setBusy(true); setError(""); setStatus(`Connecting to ${walletName}…`); setStage("tap");
    walletLog("tap", { app: choice === "backpack" ? "solflare" : choice });
    const agent = navigator.userAgent;
    const here = walletSurface(agent);
    announceAppReady(window as WalletHost);
    const found = currentProviders(window as WalletHost);
    setInjected(seen(found)); setOthers(found.others);
    const provider = extra ?? (choice === "phantom" ? found.phantom : choice === "solflare" ? found.solflare : found.backpack);
    const remembered = rememberedInApp(window.sessionStorage);
    const inside = insideWalletBrowser(window, agent, remembered);
    const standardOnly = !!extra || choice === "backpack";
    const plan = standardOnly ? (provider ? "injected" : "install") : connectPlan({ surface: here, injected: !!provider, insideWallet: inside });
    walletLog("plan", { app: choice === "backpack" ? "solflare" : choice, plan, provider: !!provider, surface: here });
    try {
      if (wallet) {
        const response = await fetch("/api/solana/auth/logout", { method: "POST" });
        if (!response.ok) throw new Error("Sign-out failed. Please retry.");
        clearMobileSession(window.sessionStorage, window.localStorage);
        setWallet(null); setStatus("");
        window.dispatchEvent(new Event("garmonpay-session-change"));
        await provider?.disconnect();
        return;
      }
      if (plan === "unavailable") {
        setStage("provider-timeout");
        emitAuthEvent("provider-timeout", false, { code: "TIMEOUT", providerFound: false, insideWallet: true, hasHint: authContext.current.hasHint, elapsedMs: authContext.current.startedAt ? Date.now() - authContext.current.startedAt : 0 });
        throw new Error(AUTH_STAGE_ERRORS.provider);
      }
      if (plan === "install") {
        setStage("install");
        throw new Error(`Install ${walletName}, then tap Connect & sign in again.`);
      }
      if (plan === "deeplink") {
        if (choice !== "phantom" && choice !== "solflare") throw new Error(`${walletName} is available from its extension or in-app browser.`);
        const referral = new URLSearchParams(window.location.search).get("ref");
        const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
        const pair = createLinkKeyPair();
        saveMobileSession(window.sessionStorage, window.localStorage, { ...pair, app: choice, network, state, createdAt: Date.now() });
        setStage("connect-link"); setStatus(`Approve connection in ${walletName}, then approve the separate sign-in message.`);
        window.location.assign(connectLink(choice, { appUrl: window.location.origin, dappPublicKey: pair.publicKey, redirectLink: mobileRedirect(window.location.origin, window.location.pathname, referral, state), network }));
        return;
      }
      if (plan === "browse") {
        if (choice !== "phantom" && choice !== "solflare") throw new Error(`${walletName} is available from its extension or in-app browser.`);
        setStage("browse"); setStatus(`Opening ${walletName}…`);
        clearMobileSession(window.sessionStorage, window.localStorage);
        const referral = new URLSearchParams(window.location.search).get("ref");
        window.location.assign(browseLink(choice, handoffPage(window.location.origin, window.location.pathname, referral, choice), window.location.origin));
        return;
      }
      if (!provider) throw new Error(`${walletName} did not provide a connect method.`);
      await runInjectedSignIn(provider, current, choice === "solflare" ? "solflare" : "phantom");
    } catch (exception) {
      const message = walletErrorText(exception);
      walletLog("error", { app: choice, code: exception && typeof exception === "object" && "code" in exception ? Number((exception as { code: unknown }).code) || 0 : 0 });
      if (current === generation.current) { setError(message); setStatus(""); setStage("error"); }
    } finally {
      signInFlight = false;
      signing.current = false;
      if (current === generation.current) setBusy(false);
    }
  }

  if (!walletAuthEnabled()) return <div className="gp-sol-wallet"><p className="gp-sol-tag" role="status">Wallet sign-in paused</p><p id="sol-wallet-paused" className="text-sm mt-3 max-w-md">Wallet connection and signing are unavailable while security verification is completed. No wallet signature is requested.</p></div>;
  const available = extra ? true : choice === "phantom" ? injected.phantom : choice === "solflare" ? injected.solflare : injected.backpack;
  const mode = extra || choice === "backpack" ? (available ? "injected" : "install") : connectionMode(surface, available);
  const shownMode = wallet ? "session" : insideWallet && surface !== "desktop" && choice !== "backpack" && !extra ? "in-app" : mode;
  const walletName = extra ? extraName : choice === "phantom" ? "Phantom" : choice === "solflare" ? "Solflare" : "Backpack";
  const inAppSignIn = !wallet && insideWallet && surface !== "desktop" && (choice === "phantom" || choice === "solflare");
  const install = choice === "phantom" || choice === "solflare" ? installUrl(choice, surface) : BACKPACK_SITE;
  return <div className="gp-sol-wallet" data-wallet-surface={surface} data-connection-mode={shownMode} data-wallet-stage={stage}>
    {!wallet && <label className="block mb-4 text-sm">Wallet network<select aria-label="Wallet network" disabled={busy} value={network} onChange={event=>setNetwork(event.target.value as AuthNetwork)} className="block w-full mt-2 rounded-lg bg-purple-950 p-3"><option value="mainnet">Mainnet — Phantom Testnet Mode off</option><option value="devnet">Devnet — Phantom Testnet Mode on</option><option value="testnet">Solana Testnet</option></select><span className="block mt-2 text-purple-200">This choice is only for the sign-in message. It does not move SOL and it does not select the network for a trade. Devnet trades are built for Devnet only. Financial operations remain paused.</span></label>}
    {!wallet && <div className="gp-wallet-picks" role="group" aria-label="Choose wallet">
      <button type="button" aria-pressed={choice === "phantom" && !extra} disabled={busy} onClick={() => { setExtra(null); setChoice("phantom"); }}>Phantom</button>
      <button type="button" aria-pressed={choice === "solflare" && !extra} disabled={busy} onClick={() => { setExtra(null); setChoice("solflare"); }}>Solflare</button>
      <button type="button" aria-pressed={choice === "backpack" && !extra} disabled={busy} onClick={() => { setExtra(null); setChoice("backpack"); }}>Backpack</button>
      <button type="button" aria-expanded={moreOpen} aria-controls="gp-more-wallets" disabled={busy} onClick={() => setMoreOpen(value => !value)}>More Wallets</button>
    </div>}
    {moreOpen && !wallet ? <div id="gp-more-wallets" className="gp-wallet-more" role="group" aria-label="More wallets">
      {others.length ? others.map(option => <button type="button" key={option.key} aria-pressed={extraName === option.name} disabled={busy} onClick={() => { setExtra(option.provider); setExtraName(option.name); }}>{option.name}</button>) : <p className="gp-fee-note">No other Solana wallet is installed.</p>}
    </div> : null}
    {choice === "backpack" && !available && !wallet ? <p className="gp-fee-note">Backpack connects when its extension or in-app browser is open. GarmonPay does not open a substitute handoff.</p> : null}
    {mode === "install" && !wallet ? <a className="gp-button gp-button-gold" href={install}>Install {walletName}</a> : <button className="gp-button gp-button-gold" disabled={busy} onClick={() => void act()}>{busy ? "Connecting…" : wallet ? "Disconnect" : inAppSignIn ? `Sign in with ${walletName}` : "Connect & sign in"}</button>}
    {mode === "browse" && !wallet && !insideWallet && <a className="gp-sol-text-link" href={install}>Install {walletName}</a>}
    <p className="gp-sol-muted">{shownMode === "in-app" && !wallet ? `Tap Sign in with ${walletName}. This page does not connect until you tap. ` : mode === "browse" && !wallet ? `Connect opens this page in ${walletName}. Sign-in continues there. ` : ""}Sign-in does not authorize a transaction or transfer. If Phantom says this request is blocked, stop. GarmonPay cannot override that warning.</p>
    {status && <p className="text-sm mt-3 text-purple-100" role="status">{status}</p>}
    {wallet && <p className="text-sm mt-3 text-green-300" role="status">Signed in. <a className="gp-sol-text-link" href="/member">Open My Dashboard</a></p>}
    {error && <p className="text-sm mt-3 text-red-300 max-w-md" role="alert">{error}</p>}
  </div>;
}
