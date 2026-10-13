"use client";
import { useEffect, useRef, useState } from "react";
import { walletAuthEnabled } from "@/lib/solana/policy";
import { reviewBrowserChallenge } from "@/lib/solana/browser-challenge";
import { reportAuthEvent, uaFamily } from "@/lib/solana/auth-event";
import { AUTH_STAGE_ERRORS, inAppDecision, pollProvider, PROVIDER_READY_EVENTS, signedInNotice } from "@/lib/solana/in-app-sign-in";
import { addressFromConnect, connectWithDeadline, signWithDeadline, walletSignature, type WalletProvider as Provider } from "@/lib/solana/wallet-provider";
import { connectPlan, connectionMode, installUrl, walletSurface, type WalletApp, type WalletSurface } from "@/lib/solana/wallet-environment";
import { announceAppReady, currentProviders, insideWalletBrowser, rememberInApp, rememberedInApp, walletErrorText, walletLog, type WalletHost } from "@/lib/solana/wallet-discovery";
import { browseLink, clearMobileSession, connectLink, createLinkKeyPair, encodeBase58, handoffPage, loadMobileSession, memberRedirect, mobileRedirect, openJson, readWalletReturn, saveMobileSession, sealJson, sharedSecret, signMessageLink, signatureBase64, walletHint, walletReferrer, type WalletReturn } from "@/lib/solana/wallet-deeplink";

import { confirmWalletSession } from "@/lib/solana/wallet-session-confirmation";

const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function emitAuthEvent(stage: string, ok: boolean, fields: { code?: string; providerFound?: boolean; insideWallet?: boolean; hasHint?: boolean; elapsedMs?: number }) {
  try {
    reportAuthEvent({ stage, ok, code: fields.code ?? "", uaFamily: uaFamily(typeof navigator === "undefined" ? "" : navigator.userAgent), insideWallet: fields.insideWallet === true, hasHint: fields.hasHint === true, providerFound: fields.providerFound === true, elapsedMs: fields.elapsedMs ?? 0 });
  } catch { /* diagnostics must not block sign-in */ }
}

export function WalletSignIn() {
  const [wallet, setWallet] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState(""), [stage, setStage] = useState("idle");
  const [choice, setChoice] = useState<WalletApp>("phantom"), [surface, setSurface] = useState<WalletSurface>("desktop");
  const [injected, setInjected] = useState({ phantom: false, solflare: false }), [insideWallet, setInsideWallet] = useState(false);
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
    setInjected({ phantom: !!found.phantom, solflare: !!found.solflare });
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
          if (active) setInjected({ phantom: !!next.phantom, solflare: !!next.solflare });
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
          const challenge = await fetch("/api/solana/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: address }) });
          const data = await challenge.json();
          walletLog("challenge-response", { httpStatus: challenge.status });
          if (!challenge.ok) throw new Error(data.error);
          const reviewed = reviewBrowserChallenge(data, address, window.location.origin, Date.now());
          setStage("sign-link"); setStatus("Connection approved. Approve the separate sign-in message in your wallet.");
          const sealed = sealJson({ message: encodeBase58(new TextEncoder().encode(reviewed.message)), session, display: "utf8" }, secret);
          saveMobileSession(storage, window.localStorage, { ...saved, peerPublicKey: peer, wallet: address, session, challengeId: reviewed.challengeId });
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
        walletLog("session-confirmed", { app: saved.app });
        clearMobileSession(storage, window.localStorage);
        if (active && current === generation.current) { setWallet(session.wallet); setStatus(""); setStage("done"); window.dispatchEvent(new Event("garmonpay-session-change")); }
      } catch (exception) {
        clearMobileSession(storage, window.localStorage);
        if (active && current === generation.current) { setError(`Wallet return [${result.kind.toUpperCase()}]: ${walletErrorText(exception)}`); setStatus(""); setStage("error"); }
      } finally { signing.current = false; if (active && current === generation.current) setBusy(false); }
    }
  }, []);

  useEffect(() => {
    if (!walletAuthEnabled()) return;
    let stopped = false;
    let found = [currentProviders(window).phantom, currentProviders(window).solflare].filter(Boolean) as Provider[];
    const clear = () => { if (signing.current) return; generation.current++; setBusy(false); setWallet(null); setStatus(""); clearMobileSession(window.sessionStorage, window.localStorage); window.dispatchEvent(new Event("garmonpay-session-change")); void fetch("/api/solana/auth/logout", { method: "POST" }).catch(() => {}); };
    const bind = (providers: Provider[]) => providers.forEach(provider => { provider.on?.("disconnect", clear); });
    bind(found);
    const watch = window.setInterval(() => {
      if (stopped) return;
      const next = [currentProviders(window).phantom, currentProviders(window).solflare].filter(Boolean) as Provider[];
      next.filter(provider => !found.includes(provider)).forEach(provider => provider.on?.("disconnect", clear));
      found = found.concat(next.filter(provider => !found.includes(provider)));
    }, 500);
    const timer = setInterval(() => {
      const current = generation.current;
      void fetch("/api/solana/auth/session", { cache: "no-store" }).then(async response => {
        const data = await response.json();
        if (current !== generation.current || signing.current) return;
        const next = response.ok && typeof data.wallet === "string" ? data.wallet : null;
        if (next !== sessionWallet.current) { generation.current++; setWallet(next); window.dispatchEvent(new Event("garmonpay-session-change")); }
      }).catch(() => { if (current === generation.current && sessionWallet.current && !signing.current) { setWallet(null); window.dispatchEvent(new Event("garmonpay-session-change")); } });
    }, 60000);
    return () => { stopped = true; clearInterval(watch); clearInterval(timer); found.forEach(provider => { provider.removeListener?.("disconnect", clear); }); };
  }, []);

  async function runInjectedSignIn(provider: Provider, current: number, app: WalletApp) {
    const walletName = app === "phantom" ? "Phantom" : "Solflare";
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
      const challenge = await fetch("/api/solana/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: connected }) });
      const data = await challenge.json();
      if (!challenge.ok) { emit("challenge-fail", false, "HTTP_" + challenge.status); throw new Error(data.error || "Sign-in challenge failed."); }
      emit("challenge-ok", true, "HTTP_" + challenge.status);
      if (current !== generation.current) throw new Error("Wallet changed during sign-in. Please retry.");
      const reviewed = reviewBrowserChallenge(data, connected, window.location.origin, Date.now());
      setStage("sign"); setStatus(`Approve the sign-in in ${walletName}. This does not authorize a transfer.`);
      emit("sign-start", true);
      let bytes: Uint8Array;
      try { bytes = walletSignature(await signWithDeadline(provider, new TextEncoder().encode(reviewed.message))); emit("sign-ok", true); }
      catch (exception) { const code = exception && typeof exception === "object" && "code" in exception ? String((exception as { code: unknown }).code) : "SIGN"; emit("sign-fail", false, code); throw new Error(`${AUTH_STAGE_ERRORS.sign} ${walletErrorText(exception)}`); }
      if (current !== generation.current) throw new Error("Wallet changed during sign-in. Please retry.");
      if (provider.publicKey && provider.publicKey.toString() !== connected) throw new Error("Wallet changed during signing. Please retry.");
      const signature = btoa(String.fromCharCode(...Array.from(bytes)));
      setStage("verify"); setStatus("Checking the signature…");
      const referralCode = new URLSearchParams(window.location.search).get("ref");
      const verified = await fetch("/api/solana/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: reviewed.challengeId, signature, referralCode }) });
      const session = await verified.json();
      if (!verified.ok) { emit("verify-fail", false, "HTTP_" + verified.status); throw new Error(`${AUTH_STAGE_ERRORS.verify} ${session.error || "Authentication failed."}`); }
      emit("verify-ok", true, "HTTP_" + verified.status);
      if (current !== generation.current || session.wallet !== connected) { await fetch("/api/solana/auth/logout", { method: "POST" }); throw new Error("Wallet changed during verification. Please retry."); }
      try { await confirmWalletSession(connected); emit("session-ok", true); }
      catch (exception) { emit("session-fail", false, "SESSION"); throw new Error(`${AUTH_STAGE_ERRORS.session} ${walletErrorText(exception)}`); }
      const profile = await fetch("/api/solana/members/me", { cache: "no-store" });
      if (!profile.ok) { emit("profile-fail", false, "HTTP_" + profile.status); throw new Error(AUTH_STAGE_ERRORS.profile); }
      emit("profile-ok", true);
      setWallet(session.wallet); setStatus(signedInNotice(app, true)); setStage("done");
      window.dispatchEvent(new Event("garmonpay-session-change"));
    } finally {
      signing.current = false;
      if (current === generation.current) setBusy(false);
    }
  }

  async function act() {
    if (!walletAuthEnabled()) return;
    const current = ++generation.current;
    const walletName = choice === "phantom" ? "Phantom" : "Solflare";
    setBusy(true); setError(""); setStatus(`Connecting to ${walletName}…`); setStage("tap");
    walletLog("tap", { app: choice });
    const agent = navigator.userAgent;
    const here = walletSurface(agent);
    announceAppReady(window as WalletHost);
    const found = currentProviders(window as WalletHost);
    setInjected({ phantom: !!found.phantom, solflare: !!found.solflare });
    const provider = choice === "phantom" ? found.phantom : found.solflare;
    const remembered = rememberedInApp(window.sessionStorage);
    const inside = insideWalletBrowser(window, agent, remembered);
    const plan = connectPlan({ surface: here, injected: !!provider, insideWallet: inside });
    walletLog("plan", { app: choice, plan, provider: !!provider, surface: here });
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
        const referral = new URLSearchParams(window.location.search).get("ref");
        const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
        const pair = createLinkKeyPair();
        saveMobileSession(window.sessionStorage, window.localStorage, { ...pair, app: choice, state, createdAt: Date.now() });
        setStage("connect-link"); setStatus(`Approve connection in ${walletName}, then approve the separate sign-in message.`);
        window.location.assign(connectLink(choice, { appUrl: window.location.origin, dappPublicKey: pair.publicKey, redirectLink: mobileRedirect(window.location.origin, window.location.pathname, referral, state) }));
        return;
      }
      if (plan === "browse") {
        setStage("browse"); setStatus(`Opening ${walletName}…`);
        clearMobileSession(window.sessionStorage, window.localStorage);
        const referral = new URLSearchParams(window.location.search).get("ref");
        window.location.assign(browseLink(choice, handoffPage(window.location.origin, window.location.pathname, referral, choice), window.location.origin));
        return;
      }
      if (!provider) throw new Error(`${walletName} did not provide a connect method.`);
      await runInjectedSignIn(provider, current, choice);
    } catch (exception) {
      const message = walletErrorText(exception);
      walletLog("error", { app: choice, code: exception && typeof exception === "object" && "code" in exception ? Number((exception as { code: unknown }).code) || 0 : 0 });
      if (current === generation.current) { setError(message); setStatus(""); setStage("error"); }
    } finally {
      signing.current = false;
      if (current === generation.current) setBusy(false);
    }
  }

  if (!walletAuthEnabled()) return <div className="gp-sol-wallet"><p className="gp-sol-tag" role="status">Wallet sign-in paused</p><p id="sol-wallet-paused" className="text-sm mt-3 max-w-md">Wallet connection and signing are unavailable while security verification is completed. No wallet signature is requested.</p></div>;
  const available = choice === "phantom" ? injected.phantom : injected.solflare;
  const mode = connectionMode(surface, available);
  const shownMode = wallet ? "session" : insideWallet && surface !== "desktop" ? "in-app" : mode;
  const walletName = choice === "phantom" ? "Phantom" : "Solflare";
  const inAppSignIn = !wallet && insideWallet && surface !== "desktop";
  const install = installUrl(choice, surface);
  return <div className="gp-sol-wallet" data-wallet-surface={surface} data-connection-mode={shownMode} data-wallet-stage={stage}>
    {!wallet && <div className="gp-wallet-picks" role="group" aria-label="Choose wallet"><button type="button" aria-pressed={choice === "phantom"} disabled={busy} onClick={() => setChoice("phantom")}>Phantom</button><button type="button" aria-pressed={choice === "solflare"} disabled={busy} onClick={() => setChoice("solflare")}>Solflare</button></div>}
    {mode === "install" && !wallet ? <a className="gp-button gp-button-gold" href={install}>Install {walletName}</a> : <button className="gp-button gp-button-gold" disabled={busy} onClick={() => void act()}>{busy ? "Connecting…" : wallet ? "Disconnect" : inAppSignIn ? `Sign in with ${walletName}` : "Connect & sign in"}</button>}
    {mode === "browse" && !wallet && !insideWallet && <a className="gp-sol-text-link" href={install}>Install {walletName}</a>}
    <p className="gp-sol-muted">{shownMode === "in-app" && !wallet ? `Tap Sign in with ${walletName}. This page does not connect until you tap. ` : mode === "browse" && !wallet ? `Connect opens this page in ${walletName}. Sign-in continues there. ` : ""}Sign-in does not authorize a transaction or transfer.</p>
    {status && <p className="text-sm mt-3 text-purple-100" role="status">{status}</p>}
    {wallet && <p className="text-sm mt-3 text-green-300" role="status">Signed in: {wallet.slice(0, 6)}…{wallet.slice(-6)}</p>}
    {error && <p className="text-sm mt-3 text-red-300 max-w-md" role="alert">{error}</p>}
  </div>;
}
