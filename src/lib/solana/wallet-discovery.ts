import type { WalletProvider } from "./wallet-provider";
import type { WalletApp } from "./wallet-environment";

/** Wallet Standard events from Phantom's documented app/wallet handshake. */
export const APP_READY_EVENT = "wallet-standard:app-ready";
export const REGISTER_WALLET_EVENT = "wallet-standard:register-wallet";
const IN_APP_KEY = "gp-solana-in-app";
const LOG_FIELDS = new Set(["app", "plan", "surface", "provider", "code", "httpStatus", "messageChain", "walletApiChain", "method", "cluster"]);

type StandardAccount = { address?: string; [key: string]: unknown };
type StandardFeature = { connect?: () => Promise<{ accounts?: StandardAccount[] }>; signMessage?: (...inputs: { account: StandardAccount; message: Uint8Array }[]) => Promise<{ signature?: Uint8Array }[]>; disconnect?: () => Promise<void> };
type StandardWallet = {
  name?: string;
  chains?: readonly string[];
  features?: Record<string, StandardFeature>;
};
export type DiscoveredWallet = { name: string; key: string; provider: WalletProvider };

/** One product key per Solana wallet. Account numbers, chain suffixes, and repeat announcements do not create another wallet. */
export function solanaWalletIdentity(wallet: { name?: string; chains?: readonly string[]; features?: Record<string, unknown> }): string | null {
  const features = wallet.features ?? {};
  const sign = features["solana:signMessage"];
  if (!sign || typeof sign !== "object" || typeof (sign as { signMessage?: unknown }).signMessage !== "function") return null;
  const chains = Array.isArray(wallet.chains) ? wallet.chains.filter((chain): chain is string => typeof chain === "string") : [];
  if (chains.length > 0 && !chains.some(chain => chain.startsWith("solana:"))) return null;
  if (typeof wallet.name !== "string") return null;
  const raw = wallet.name.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/\s+\d+$/, "").replace(/\s*[#([].*$/, "").replace(/\s+solana$/, "").trim() || null;
}
type RegisterApi = { register: (...wallets: StandardWallet[]) => void };
export type WalletHost = EventTarget & {
  phantom?: { solana?: WalletProvider & { isPhantom?: boolean } };
  solflare?: WalletProvider & { isSolflare?: boolean };
  solana?: WalletProvider & { isPhantom?: boolean; isSolflare?: boolean };
  __gpWallets?: StandardWallet[];
  __gpWalletListening?: boolean;
};

export function walletLog(stage: string, fields?: Record<string, string | boolean | number>) {
  const safe: Record<string, string | boolean | number> = {};
  for (const [key, value] of Object.entries(fields ?? {})) if (LOG_FIELDS.has(key)) safe[key] = value;
  console.info("[garmonpay-wallet]", stage, JSON.stringify(safe));
}

export function walletErrorText(exception: unknown) {
  const code = exception && typeof exception === "object" && "code" in exception ? Number((exception as { code: unknown }).code) : NaN;
  if (exception instanceof Error && /chain ID.*match/i.test(exception.message)) return 'Phantom network mismatch. Select Devnet below if Phantom is in Testnet Mode, or Mainnet if Testnet Mode is off, then retry. No transaction is requested.';
  if (code === 4001) return "The wallet request was declined. No account was changed.";
  const message = exception instanceof Error ? exception.message : exception && typeof exception === "object" && "message" in exception && typeof (exception as { message: unknown }).message === "string" ? (exception as { message: string }).message : "";
  if (!message || message.length > 180) return "Wallet sign-in failed. Please retry.";
  return message;
}

export function rememberInApp(storage: Storage, app: WalletApp | null) {
  if (app) storage.setItem(IN_APP_KEY, app);
}

export function rememberedInApp(storage: Storage): WalletApp | null {
  const value = storage.getItem(IN_APP_KEY);
  return value === "phantom" || value === "solflare" ? value : null;
}

export function insideWalletBrowser(view: object, userAgent: string, remembered: WalletApp | null) {
  return !!remembered || "phantom" in view || "solflare" in view || /Phantom|Solflare/i.test(userAgent);
}

function legacyProvider(provider: (WalletProvider & { isPhantom?: boolean; isSolflare?: boolean }) | undefined, flag: "isPhantom" | "isSolflare") {
  if (!provider || provider[flag] !== true || typeof provider.connect !== "function" || typeof provider.signMessage !== "function") return undefined;
  return provider;
}

function standardProvider(wallet: StandardWallet | undefined): WalletProvider | undefined {
  const connect = wallet?.features?.["standard:connect"]?.connect;
  const signMessage = wallet?.features?.["solana:signMessage"]?.signMessage;
  if (typeof connect !== "function" || typeof signMessage !== "function") return undefined;
  let account: StandardAccount | null = null;
  return {
    async connect() {
      const result = await connect();
      const found = result?.accounts?.find(item => typeof item?.address === "string" && item.address);
      if (!found?.address) throw new Error("Wallet did not provide a valid Solana address.");
      account = found;
      return { publicKey: { toString: () => found.address as string } };
    },
    async signMessage(message: Uint8Array) {
      if (!account) throw new Error("Connect the wallet before requesting a signature.");
      const signed = await signMessage({ account, message });
      const signature = signed?.[0]?.signature;
      if (!(signature instanceof Uint8Array)) throw new Error("Invalid wallet signature response.");
      return signature;
    },
    async disconnect() { await wallet?.features?.["standard:disconnect"]?.disconnect?.(); },
  };
}

function rememberWallets(view: WalletHost, wallets: StandardWallet[]) {
  view.__gpWallets ??= [];
  for (const wallet of wallets) {
    const key = solanaWalletIdentity(wallet);
    if (!key) continue;
    const index = view.__gpWallets.findIndex(existing => solanaWalletIdentity(existing) === key);
    if (index >= 0) view.__gpWallets[index] = wallet;
    else view.__gpWallets.push(wallet);
  }
}

export function ensureWalletListener(view: WalletHost) {
  if (view.__gpWalletListening) return;
  view.__gpWalletListening = true;
  view.__gpWallets ??= [];
  view.addEventListener(REGISTER_WALLET_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<((api: RegisterApi) => void) | undefined>).detail;
    if (typeof detail !== "function") return;
    detail({ register: (...registered) => { rememberWallets(view, registered); } });
  });
}

/** Tell injected wallets the page is ready, then read whatever registered synchronously. */
export function announceAppReady(view: WalletHost) {
  ensureWalletListener(view);
  view.dispatchEvent(new CustomEvent(APP_READY_EVENT, { detail: { register: (...wallets: StandardWallet[]) => { rememberWallets(view, wallets); } } }));
}

export function currentProviders(view: WalletHost) {
  const shared = view.solana;
  const named = (app: string) => standardProvider(view.__gpWallets?.find(wallet => solanaWalletIdentity(wallet) === app));
  const reserved = new Set(["phantom", "solflare", "backpack"]);
  const listed = new Set(reserved);
  return {
    phantom: legacyProvider(view.phantom?.solana, "isPhantom") ?? legacyProvider(shared?.isPhantom ? shared : undefined, "isPhantom") ?? named("phantom"),
    solflare: legacyProvider(view.solflare, "isSolflare") ?? legacyProvider(shared?.isSolflare ? shared : undefined, "isSolflare") ?? named("solflare"),
    backpack: named("backpack"),
    others: (view.__gpWallets ?? []).flatMap(wallet => {
      const key = solanaWalletIdentity(wallet);
      if (!key || listed.has(key)) return [];
      listed.add(key);
      const provider = standardProvider(wallet);
      const name = wallet.name?.trim() || key;
      return provider ? [{ name, key, provider }] : [];
    }),
  };
}
