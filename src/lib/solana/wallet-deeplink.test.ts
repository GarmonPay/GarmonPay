import { describe, expect, it } from "vitest";
import { connectionMode, installUrl, walletSurface } from "./wallet-environment";
import { browseLink, connectLink, createLinkKeyPair, decodeBase58, encodeBase58, handoffPage, memberRedirect, mobileHandoffAction, openJson, readWalletReturn, sealJson, sharedSecret, signMessageLink, signatureBase64, saveLinkSession, mobileRedirect, saveMobileSession, loadMobileSession, clearMobileSession } from "./wallet-deeplink";

describe("wallet surface detection", () => {
  it("distinguishes desktop, iPhone, and Android", () => {
    expect(walletSurface("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("desktop");
    expect(walletSurface("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iphone");
    expect(walletSurface("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
  });

  it("uses the injected provider inside a wallet browser and browse links on mobile", () => {
    expect(connectionMode("iphone", true)).toBe("injected");
    expect(connectionMode("android", true)).toBe("injected");
    expect(connectionMode("iphone", false)).toBe("browse");
    expect(connectionMode("android", false)).toBe("browse");
    expect(connectionMode("desktop", false)).toBe("install");
    expect(connectionMode("desktop", true)).toBe("injected");
  });

  it("points installation links at the wallets' published stores", () => {
    expect(installUrl("phantom", "iphone")).toBe("https://apps.apple.com/app/phantom-solana-wallet/1598432977");
    expect(installUrl("phantom", "android")).toBe("https://play.google.com/store/apps/details?id=app.phantom");
    expect(installUrl("phantom", "desktop")).toBe("https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa");
    expect(installUrl("solflare", "iphone")).toBe("https://apps.apple.com/us/app/solflare-solana-wallet/id1580902717");
    expect(installUrl("solflare", "android")).toBe("https://play.google.com/store/apps/details?id=com.solflare.mobile");
    expect(installUrl("solflare", "desktop")).toContain("solflare-wallet/bhhhlbepdkbapadjdnnojkbgioiodbic");
  });
});

describe("official mobile sign-in links", () => {
  const redirect = "https://handed-teens-shortcuts-kent.trycloudflare.com/solana/members";
  it("builds Phantom connect and sign-message links without a transfer method", () => {
    const connect = new URL(connectLink("phantom", { appUrl: "https://example.com", dappPublicKey: "abc", redirectLink: redirect }));
    expect(connect.origin + connect.pathname).toBe("https://phantom.com/ul/v1/connect");
    expect(connect.searchParams.get("cluster")).toBe("mainnet-beta");
    expect(connect.searchParams.get("redirect_link")).toBe(redirect);
    expect(connect.toString()).not.toMatch(/signTransaction|signAndSendTransaction|transfer/i);
    const sign = new URL(signMessageLink("phantom", { dappPublicKey: "abc", nonce: "nonce", redirectLink: redirect, payload: "payload" }));
    expect(sign.origin + sign.pathname).toBe("https://phantom.com/ul/v1/signMessage");
  });

  it("opens the members page inside the wallet browser instead of waiting for a lost callback", () => {
    const page = handoffPage("https://handed-teens-shortcuts-kent.trycloudflare.com", "/solana/members", "ab".repeat(16), "phantom");
    const link = browseLink("phantom", page, "https://handed-teens-shortcuts-kent.trycloudflare.com");
    expect(link.startsWith("https://phantom.com/ul/browse/")).toBe(true);
    expect(decodeURIComponent(link.slice("https://phantom.com/ul/browse/".length).split("?")[0])).toContain("gp_wallet=phantom");
    expect(link).not.toMatch(/signTransaction|signAndSendTransaction|\/v1\/connect/);
    expect(browseLink("solflare", page, "https://handed-teens-shortcuts-kent.trycloudflare.com").startsWith("https://solflare.com/ul/v1/browse/")).toBe(true);
    expect(mobileHandoffAction({ callback: true, storedSecret: false, injected: true })).toBe("injected");
    expect(mobileHandoffAction({ callback: true, storedSecret: false, injected: false })).toBe("recover");
  });

  it("keeps only a same-site referral on the return address", () => {
    expect(memberRedirect("https://handed-teens-shortcuts-kent.trycloudflare.com", "/solana/members", "a".repeat(32))).toContain("ref=" + "a".repeat(32));
    expect(memberRedirect("https://garmonpay.com", "/solana/members", "ab23cdef")).toContain("ref=ab23cdef");
    expect(memberRedirect("https://garmonpay.com", "/solana/members", "HolyGhost")).not.toContain("ref=");
    expect(memberRedirect("https://handed-teens-shortcuts-kent.trycloudflare.com", "/solana/members", "javascript:alert(1)")).not.toContain("javascript");
    expect(() => memberRedirect("http://evil.example", "/solana/members", null)).toThrow();
  });

  it("treats a wallet error code as a declined request", () => {
    expect(readWalletReturn("?errorCode=4001&errorMessage=User%20rejected")).toEqual({ kind: "declined" });
    expect(readWalletReturn("?phantom_encryption_public_key=key&nonce=n&data=d").kind).toBe("connect");
    expect(readWalletReturn("?nonce=n&data=d").kind).toBe("signed");
    expect(readWalletReturn("?ref=abc")).toEqual({ kind: "none" });
  });

  it("round-trips the encrypted sign-in payload with TweetNaCl", () => {
    const dapp = createLinkKeyPair();
    const wallet = createLinkKeyPair();
    const secret = sharedSecret(wallet.publicKey, dapp.secretKey);
    const sealed = sealJson({ message: encodeBase58(new TextEncoder().encode("sign in")), session: "session-token", display: "utf8" }, secret);
    const other = sharedSecret(dapp.publicKey, wallet.secretKey);
    expect(openJson(sealed.payload, sealed.nonce, other).session).toBe("session-token");
    const signature = signatureBase64(encodeBase58(new Uint8Array(64).fill(7)));
    expect(signature).toMatch(/^[A-Za-z0-9+/]{86}==$/);
    expect(decodeBase58("BSFtCudCd4pR4LSFqWPjbtXPKSNVbGkc35gRNdnqjMCU")).toHaveLength(32);
  });
});

function memory(): Storage {const values = new Map<string,string>(); return {getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);},clear:()=>values.clear(),key:()=>null,get length(){return values.size;}};}
describe('mobile return context security',()=>{
 it('recovers a callback in a new Safari tab, rejects another context and expires transport secrets',()=>{
  const tab=memory(),origin=memory(),pair=createLinkKeyPair(),now=Date.now(),state='a'.repeat(32);
  saveMobileSession(tab,origin,{...pair,app:'phantom',state,createdAt:now});
  expect(loadMobileSession(memory(),origin,state,now)?.publicKey).toBe(pair.publicKey);
  const staleTab=memory();saveMobileSession(staleTab,memory(),{...pair,app:'phantom',state:'c'.repeat(32),createdAt:now});
  expect(loadMobileSession(staleTab,origin,state,now)?.state).toBe(state);
  expect(loadMobileSession(tab,origin,'b'.repeat(32),now)).toBeNull();
  const expired=memory();saveLinkSession(expired,{...pair,app:'phantom',state,createdAt:now});expect(loadMobileSession(expired,memory(),state,now+600001)).toBeNull();
  expect(loadMobileSession(expired,memory(),state,now)).toBeNull();
  clearMobileSession(tab,origin);expect(loadMobileSession(tab,origin,state,now)).toBeNull();
 });
 it('keeps the original browser return address bound through both approvals',()=>{
  const redirect=mobileRedirect('https://example.com','/solana/members','b'.repeat(32),'a'.repeat(32));
  expect(new URL(redirect).searchParams.get('gp_state')).toBe('a'.repeat(32));
  for(const link of [connectLink('phantom',{appUrl:'https://example.com',dappPublicKey:'key',redirectLink:redirect}),signMessageLink('phantom',{dappPublicKey:'key',nonce:'nonce',payload:'encrypted',redirectLink:redirect})])expect(new URL(link).searchParams.get('redirect_link')).toBe(redirect);
 });
});
