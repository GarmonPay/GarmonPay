import nacl from "tweetnacl";
import type { WalletApp } from "./wallet-environment";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const PHANTOM_CONNECT = "https://phantom.com/ul/v1/connect";
const PHANTOM_SIGN = "https://phantom.com/ul/v1/signMessage";
const SOLFLARE_CONNECT = "https://solflare.com/ul/v1/connect";
const SOLFLARE_SIGN = "https://solflare.com/ul/v1/signMessage";
const PHANTOM_BROWSE = "https://phantom.com/ul/browse/";
const SOLFLARE_BROWSE = "https://solflare.com/ul/v1/browse/";
const LINK_KEY = "gp-solana-mobile-link";

export type LinkSession = {
  createdAt?: number;
  state?: string;
  app: WalletApp;
  publicKey: string;
  secretKey: string;
  peerPublicKey?: string;
  wallet?: string;
  session?: string;
  challengeId?: string;
};

export type WalletReturn =
  | { kind: "none" }
  | { kind: "declined" }
  | { kind: "connect"; app: WalletApp; peerPublicKey: string; nonce: string; data: string }
  | { kind: "signed"; nonce: string; data: string };

export function encodeBase58(bytes: Uint8Array): string {
  let n = BigInt(0);
  for (const byte of bytes) n = (n << BigInt(8)) + BigInt(byte);
  let result = "";
  while (n > BigInt(0)) {
    result = ALPHABET[Number(n % BigInt(58))] + result;
    n /= BigInt(58);
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = "1" + result;
  }
  return result;
}

export function decodeBase58(value: string): Uint8Array {
  if (!value || value.length > 8192) throw new Error("Invalid wallet response.");
  let n = BigInt(0);
  for (const character of value) {
    const digit = ALPHABET.indexOf(character);
    if (digit < 0) throw new Error("Invalid wallet response.");
    n = n * BigInt(58) + BigInt(digit);
  }
  const bytes: number[] = [];
  while (n > BigInt(0)) {
    bytes.unshift(Number(n % BigInt(256)));
    n /= BigInt(256);
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export function browseLink(app: WalletApp, pageUrl: string, appUrl: string): string {
  const page = new URL(pageUrl);
  const source = new URL(appUrl);
  if ((page.protocol !== "https:" && page.hostname !== "localhost" && page.hostname !== "127.0.0.1") || source.origin !== page.origin) throw new Error("Secure page required");
  const base = app === "phantom" ? PHANTOM_BROWSE : SOLFLARE_BROWSE;
  return base + encodeURIComponent(page.toString()) + "?ref=" + encodeURIComponent(source.origin);
}

export function handoffPage(origin: string, pathname: string, referral: string | null, app: WalletApp): string {
  const url = new URL(memberRedirect(origin, pathname, referral));
  url.searchParams.set("gp_wallet", app);
  return url.toString();
}

export function walletHint(search: string): WalletApp | null {
  const value = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("gp_wallet");
  return value === "phantom" || value === "solflare" ? value : null;
}

export function walletReferrer(referrer: string): WalletApp | null {
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host === "phantom.com" || host.endsWith(".phantom.com")) return "phantom";
    if (host === "solflare.com" || host.endsWith(".solflare.com")) return "solflare";
  } catch { return null; }
  return null;
}

/** The in-app page often does not keep the Safari query or storage. The provider host still identifies it. */
export function handoffAppFrom(input: { hint: WalletApp | null; referrer: WalletApp | null; stored: WalletApp | null; surface: "desktop" | "iphone" | "android"; hostPhantom: boolean; hostSolflare: boolean }): WalletApp | null {
  if (input.surface === "desktop") return input.hint ?? input.referrer;
  if (input.hint) return input.hint;
  if (input.referrer) return input.referrer;
  if (input.hostPhantom) return "phantom";
  if (input.hostSolflare) return "solflare";
  return input.stored;
}

/** After a browse handoff, continue with that wallet's injected provider. Opening the browser is not sign-in. */
export function handoffResume(input: { app: WalletApp | null; phantom: boolean; solflare: boolean; hasSession: boolean }): "phantom" | "solflare" | "wait" | "none" {
  if (!input.app || input.hasSession) return "none";
  if (input.app === "phantom" && input.phantom) return "phantom";
  if (input.app === "solflare" && input.solflare) return "solflare";
  return "wait";
}

/** A wallet in-app browser does not share the page that launched it. Sign in there instead of waiting for the old callback. */
export function mobileHandoffAction(input: { callback: boolean; storedSecret: boolean; injected: boolean }): "injected" | "decrypt" | "recover" | "ready" {
  if (input.injected) return "injected";
  if (input.callback && input.storedSecret) return "decrypt";
  if (input.callback) return "recover";
  return "ready";
}

export function memberRedirect(origin: string, pathname: string, referral: string | null): string {
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("Secure return address required");
  if (!pathname.startsWith("/") || pathname.startsWith("//")) throw new Error("Invalid return path");
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  if (referral && /^[0-9a-f]{32}$/.test(referral)) url.searchParams.set("ref", referral);
  return url.toString();
}

function endpoint(app: WalletApp, method: "connect" | "signMessage"): string {
  if (app === "phantom") return method === "connect" ? PHANTOM_CONNECT : PHANTOM_SIGN;
  return method === "connect" ? SOLFLARE_CONNECT : SOLFLARE_SIGN;
}

export function connectLink(app: WalletApp, input: { appUrl: string; dappPublicKey: string; redirectLink: string }): string {
  const url = new URL(endpoint(app, "connect"));
  url.searchParams.set("app_url", input.appUrl);
  url.searchParams.set("dapp_encryption_public_key", input.dappPublicKey);
  url.searchParams.set("redirect_link", input.redirectLink);
  url.searchParams.set("cluster", "mainnet-beta");
  return url.toString();
}

export function signMessageLink(app: WalletApp, input: { dappPublicKey: string; nonce: string; redirectLink: string; payload: string }): string {
  const url = new URL(endpoint(app, "signMessage"));
  url.searchParams.set("dapp_encryption_public_key", input.dappPublicKey);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("redirect_link", input.redirectLink);
  url.searchParams.set("payload", input.payload);
  return url.toString();
}

export function createLinkKeyPair(): { publicKey: string; secretKey: string } {
  const pair = nacl.box.keyPair();
  return { publicKey: encodeBase58(pair.publicKey), secretKey: encodeBase58(pair.secretKey) };
}

export function sharedSecret(peerPublicKey: string, secretKey: string): Uint8Array {
  return nacl.box.before(decodeBase58(peerPublicKey), decodeBase58(secretKey));
}

export function sealJson(value: { message: string; session: string; display: "utf8" }, secret: Uint8Array): { nonce: string; payload: string } {
  const nonce = nacl.randomBytes(24);
  const payload = nacl.box.after(new TextEncoder().encode(JSON.stringify(value)), nonce, secret);
  return { nonce: encodeBase58(nonce), payload: encodeBase58(payload) };
}

export function openJson(data: string, nonce: string, secret: Uint8Array): Record<string, unknown> {
  const opened = nacl.box.open.after(decodeBase58(data), decodeBase58(nonce), secret);
  if (!opened) throw new Error("Unable to read the wallet response.");
  const parsed: unknown = JSON.parse(new TextDecoder().decode(opened));
  if (!parsed || typeof parsed !== "object") throw new Error("Unable to read the wallet response.");
  return parsed as Record<string, unknown>;
}

export function signatureBase64(signature: string): string {
  const bytes = decodeBase58(signature);
  if (bytes.length !== 64) throw new Error("Invalid wallet signature response.");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  if (!/^[A-Za-z0-9+/]{86}==$/.test(encoded)) throw new Error("Invalid wallet signature response.");
  return encoded;
}

export function readWalletReturn(search: string): WalletReturn {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("errorCode")) return { kind: "declined" };
  const nonce = params.get("nonce");
  const data = params.get("data");
  const phantom = params.get("phantom_encryption_public_key");
  const solflare = params.get("solflare_encryption_public_key");
  if (phantom && nonce && data) return { kind: "connect", app: "phantom", peerPublicKey: phantom, nonce, data };
  if (solflare && nonce && data) return { kind: "connect", app: "solflare", peerPublicKey: solflare, nonce, data };
  if (nonce && data) return { kind: "signed", nonce, data };
  return { kind: "none" };
}

export function saveLinkSession(storage: Storage, value: LinkSession) {
  storage.setItem(LINK_KEY, JSON.stringify(value));
}

export function loadLinkSession(storage: Storage): LinkSession | null {
  const raw = storage.getItem(LINK_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LinkSession;
    if (parsed.app !== "phantom" && parsed.app !== "solflare") return null;
    if (!parsed.publicKey || !parsed.secretKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLinkSession(storage: Storage) {
  storage.removeItem(LINK_KEY);
}

/** Short-lived encryption state only, never a wallet private key or member cookie. */
export function mobileRedirect(origin: string, pathname: string, referral: string | null, state: string): string {
 if (!/^[0-9a-f]{32}$/.test(state)) throw new Error('Invalid wallet return state.');
 const url = new URL(memberRedirect(origin, pathname, referral)); url.searchParams.set('gp_state', state); return url.toString();
}
export function saveMobileSession(tab: Storage, origin: Storage, value: LinkSession) {
 saveLinkSession(tab, value); saveLinkSession(origin, value);
}
export function loadMobileSession(tab: Storage, origin: Storage, state: string | null, now = Date.now()): LinkSession | null {
 for (const storage of [tab, origin]) {
  const saved = loadLinkSession(storage);
  if (!saved) continue;
  if (!saved.createdAt || now - saved.createdAt > 10 * 60000 || saved.createdAt > now) { clearLinkSession(storage); continue; }
  if (state && /^[0-9a-f]{32}$/.test(state) && saved.state === state) return saved;
 }
 return null;
}
export function clearMobileSession(tab: Storage, origin: Storage) { clearLinkSession(tab); clearLinkSession(origin); }
