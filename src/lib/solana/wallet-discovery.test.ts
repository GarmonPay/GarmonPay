import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { APP_READY_EVENT, REGISTER_WALLET_EVENT, announceAppReady, currentProviders, insideWalletBrowser, rememberedInApp, rememberInApp, solanaWalletIdentity, walletErrorText, type WalletHost } from "./wallet-discovery";
import { handoffAppFrom, handoffResume, walletReferrer } from "./wallet-deeplink";
import { connectPlan } from "./wallet-environment";

const address = "11111111111111111111111111111111";

function host() {
  return new EventTarget() as WalletHost;
}

describe("Phantom provider discovery", () => {
  it("reads the documented injected provider only when isPhantom is set", () => {
    const view = host();
    view.phantom = { solana: { isPhantom: true, connect: async () => ({ publicKey: { toString: () => address } }), signMessage: async () => new Uint8Array(64), disconnect: async () => {} } };
    expect(currentProviders(view).phantom?.connect).toBeTypeOf("function");
    const incomplete = host();
    incomplete.phantom = { solana: { connect: async () => {}, signMessage: async () => new Uint8Array(64), disconnect: async () => {} } };
    expect(currentProviders(incomplete).phantom).toBeUndefined();
  });

  it("asks the wallet to register and can connect from that registration", async () => {
    const view = host();
    let connectCalls = 0;
    const account = { address, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: ['solana:signMessage'] };
    view.addEventListener(APP_READY_EVENT, event => {
      const api = (event as CustomEvent).detail;
      api.register({ name: 'Phantom', features: {
        'standard:connect': { connect: async () => { connectCalls++; return { accounts: [account] }; } },
        'solana:signMessage': { signMessage: async (input: {account: unknown; message: Uint8Array}) => { expect(input.account).toBe(account); expect(input.message).toBeInstanceOf(Uint8Array); return [{signature:new Uint8Array(64)}]; } },
      } });
    });
    expect(currentProviders(view).phantom).toBeUndefined();
    announceAppReady(view);
    const provider = currentProviders(view).phantom;
    expect(provider).toBeDefined();
    expect((await provider!.connect())?.publicKey?.toString()).toBe(address);
    expect(connectCalls).toBe(1);
    expect(await provider!.signMessage(new Uint8Array([1]), "utf8")).toBeInstanceOf(Uint8Array);
  });

  it("keeps one Solana MetaMask and hides an Ethereum-only provider", async () => {
    const view = host();
    const account = { address, publicKey: new Uint8Array(32) };
    const sign = async () => [{ signature: new Uint8Array(64) }];
    const connect = async () => ({ accounts: [account] });
    const metamask = (name: string, chains: string[]) => ({
      name,
      chains,
      features: { "standard:connect": { connect }, "solana:signMessage": { signMessage: sign } },
    });
    for (const name of ["MetaMask", "MetaMask ", "MetaMask 2", "MetaMask (Solana)", "MetaMask #12", "MetaMask\u200b"]) {
      announceAppReady(view);
      view.dispatchEvent(new CustomEvent(REGISTER_WALLET_EVENT, { detail: (api: { register: (...wallets: unknown[]) => void }) => api.register(metamask(name, ["solana:mainnet", "eip155:1"])) }));
    }
    announceAppReady(view);
    view.dispatchEvent(new CustomEvent(APP_READY_EVENT, { detail: { register: (...wallets: ReturnType<typeof metamask>[]) => {
      wallets.forEach(() => {});
    } } }));
    const ethereumOnly = { name: "MetaMask", chains: ["eip155:1"], features: { "standard:connect": { connect }, "solana:signMessage": { signMessage: sign } } };
    const glow = metamask("Glow", ["solana:mainnet"]);
    view.dispatchEvent(new CustomEvent(REGISTER_WALLET_EVENT, { detail: (api: { register: (...wallets: unknown[]) => void }) => api.register(ethereumOnly, glow, glow) }));
    const others = currentProviders(view).others;
    expect(others.map(option => option.key)).toEqual(["metamask", "glow"]);
    expect(solanaWalletIdentity(ethereumOnly)).toBeNull();
    expect((await others[0].provider.connect())?.publicKey?.toString()).toBe(address);
    expect(await others[0].provider.signMessage(new Uint8Array([1]), "utf8")).toBeInstanceOf(Uint8Array);
    expect(view.__gpWallets).toHaveLength(2);
  });

  it("does not open a browse link when the page is already inside a wallet", () => {
    expect(connectPlan({ surface: "iphone", injected: false, insideWallet: true })).toBe("unavailable");
    expect(connectPlan({ surface: "iphone", injected: true, insideWallet: true })).toBe("injected");
    expect(connectPlan({ surface: "iphone", injected: false, insideWallet: false })).toBe("browse");
    expect(connectPlan({ surface: "desktop", injected: false, insideWallet: false })).toBe("install");
    expect(insideWalletBrowser({}, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", null)).toBe(false);
    expect(insideWalletBrowser({}, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Phantom", null)).toBe(true);
    expect(handoffResume({ app: "phantom", phantom: true, solflare: false, hasSession: false })).toBe("phantom");
    expect(handoffResume({ app: "phantom", phantom: false, solflare: false, hasSession: false })).toBe("wait");
    expect(handoffResume({ app: null, phantom: true, solflare: false, hasSession: false })).toBe("none");
    expect(handoffResume({ app: "phantom", phantom: true, solflare: false, hasSession: true })).toBe("none");
    expect(walletReferrer("https://phantom.com/ul/browse/example")).toBe("phantom");
    expect(walletReferrer("https://handed-teens-shortcuts-kent.trycloudflare.com/solana/members")).toBeNull();
    expect(handoffAppFrom({ hint: null, referrer: null, stored: null, surface: "iphone", hostPhantom: true, hostSolflare: false })).toBe("phantom");
    expect(handoffAppFrom({ hint: null, referrer: null, stored: null, surface: "desktop", hostPhantom: true, hostSolflare: false })).toBeNull();
    expect(handoffAppFrom({ hint: null, referrer: "phantom", stored: null, surface: "iphone", hostPhantom: false, hostSolflare: false })).toBe("phantom");
  });

  it("remembers an in-app handoff without treating a normal mobile browser as one", () => {
    const storage = new Map<string, string>();
    const memory = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); }, clear: () => storage.clear(), key: () => null, length: 0 } as Storage;
    expect(rememberedInApp(memory)).toBeNull();
    rememberInApp(memory, "phantom");
    expect(rememberedInApp(memory)).toBe("phantom");
    expect(insideWalletBrowser({}, "Mozilla/5.0 (iPhone)", rememberedInApp(memory))).toBe(true);
  });

  it("keeps the Connect tap on the injected provider and out of a nested browse link", () => {
    const source = readFileSync("src/components/solana/WalletSignIn.tsx", "utf8");
    const act = source.slice(source.indexOf("async function act"), source.indexOf("return <div className=\"gp-sol-wallet\""));
    const signIn = source.slice(source.indexOf("async function runInjectedSignIn"), source.indexOf("async function act"));
    expect(signIn.indexOf("connectWithDeadline(")).toBeGreaterThan(-1);
    expect(signIn.indexOf("connectWithDeadline(")).toBeLessThan(signIn.indexOf("requestChallenge("));
    expect(signIn.indexOf("signWithDeadline(")).toBeGreaterThan(signIn.indexOf("requestChallenge("));
    expect(source.match(/\/api\/solana\/auth\/challenge/g)?.length).toBe(1);
    expect(source.slice(0, source.indexOf("async function runInjectedSignIn"))).not.toContain("runInjectedSignIn(");
    expect(source).toContain("pollProvider(");
    expect(source).toContain("inAppDecision(");
    expect(act).toContain("browseLink(");
    expect(act).toContain("rememberedInApp(");
    expect(act).not.toContain("insideWalletBrowser(window, agent, null)");
    expect(act.indexOf('plan === "unavailable"')).toBeLessThan(act.indexOf("browseLink("));
    expect(source).not.toContain("The wallet connection expired");
    expect(source).not.toContain("signInWith(");
  });

  it("surfaces a wallet rejection without keeping a signature", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(walletErrorText({ code: 4001, message: "User rejected the request." })).toBe("The wallet request was declined. No account was changed.");
    expect(walletErrorText({ message: "x".repeat(300) })).toBe("Wallet sign-in failed. Please retry.");
    spy.mockRestore();
  });
});
