import type { WalletProvider } from "./wallet-provider";
import type { WalletApp } from "./wallet-environment";

/** Wallet Standard events from Phantom's documented app/wallet handshake. */
export const APP_READY_EVENT = "wallet-standard:app-ready";
export const REGISTER_WALLET_EVENT = "wallet-standard:register-wallet";
const IN_APP_KEY = "gp-solana-in-app";
const LOG_FIELDS = new Set(["app", "plan", "surface", "provider", "code", "httpStatus"]);

type StandardAccount = { address?: string; [key: string]: unknown };
type StandardWallet = {
  name?: string;
  features?: Record<string, { connect?: () => Promise<{ accounts?: StandardAccount[] }>; signMessage?: (...inputs: { account: StandardAccount; message: Uint8Array }[]) => Promise<{ signature?: Uint8Array }[]>; disconnect?: () => Promise<void> }>;
};
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
  console.info("[garmonpay-wallet]", stage, safe);
}

export function walletErrorText(exception: unknown) {
  const code = exception && typeof exception === "object" && "code" in exception ? Number((exception as { code: unknown }).code) : NaN;
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

export function ensureWalletListener(view: WalletHost) {
  if (view.__gpWalletListening) return;
  view.__gpWalletListening = true;
  view.__gpWallets ??= [];
  view.addEventListener(REGISTER_WALLET_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<((api: RegisterApi) => void) | undefined>).detail;
    if (typeof detail !== "function") return;
    detail({ register: (...registered) => { view.__gpWallets?.push(...registered); } });
  });
}

/** Tell injected wallets the page is ready, then read whatever registered synchronously. */
export function announceAppReady(view: WalletHost) {
  ensureWalletListener(view);
  view.dispatchEvent(new CustomEvent(APP_READY_EVENT, { detail: { register: (...wallets: StandardWallet[]) => { view.__gpWallets?.push(...wallets); } } }));
}

export function currentProviders(view: WalletHost) {
  const shared = view.solana;
  const named = (app: WalletApp) => standardProvider(view.__gpWallets?.find(wallet => wallet.name?.toLowerCase() === app));
  return {
    phantom: legacyProvider(view.phantom?.solana, "isPhantom") ?? legacyProvider(shared?.isPhantom ? shared : undefined, "isPhantom") ?? named("phantom"),
    solflare: legacyProvider(view.solflare, "isSolflare") ?? legacyProvider(shared?.isSolflare ? shared : undefined, "isSolflare") ?? named("solflare"),
  };
}
