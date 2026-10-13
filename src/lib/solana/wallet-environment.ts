export type WalletSurface = "desktop" | "iphone" | "android";
export type WalletApp = "phantom" | "solflare";
export type ConnectionMode = "injected" | "browse" | "install";
export type ConnectPlan = "injected" | "browse" | "deeplink" | "install" | "unavailable";

export function walletSurface(userAgent: string): WalletSurface {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iphone";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

/** Inside a wallet browser, never open that wallet's browse link again. */
export function connectPlan(input: { surface: WalletSurface; injected: boolean; insideWallet: boolean }): ConnectPlan {
  if (input.injected) return "injected";
  if (input.insideWallet) return "unavailable";
  if (input.surface === "desktop") return "install";
  return "browse";
}

/** Injected providers mean the desktop extension or the wallet's own browser. */
export function connectionMode(surface: WalletSurface, injected: boolean): ConnectionMode {
  if (injected) return "injected";
  if (surface === "desktop") return "install";
  return "browse";
}

/** Store links taken from the wallets' own download pages. */
export function installUrl(app: WalletApp, surface: WalletSurface): string {
  if (app === "phantom") {
    if (surface === "iphone") return "https://apps.apple.com/app/phantom-solana-wallet/1598432977";
    if (surface === "android") return "https://play.google.com/store/apps/details?id=app.phantom";
    return "https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa";
  }
  if (surface === "iphone") return "https://apps.apple.com/us/app/solflare-solana-wallet/id1580902717";
  if (surface === "android") return "https://play.google.com/store/apps/details?id=com.solflare.mobile";
  return "https://chromewebstore.google.com/detail/solflare-wallet/bhhhlbepdkbapadjdnnojkbgioiodbic";
}
