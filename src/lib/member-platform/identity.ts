import { walletAuthEnabled } from "@/lib/solana/policy";

/**
 * Production members are identified by a signed wallet session.
 * This contract does not read cookies, create sessions, or turn wallet authentication on.
 */
export function memberIdentityContract() {
  const enabled = walletAuthEnabled();
  return {
    productionSource: "wallet-signature" as const,
    walletAuthEnabled: enabled,
    connected: false as const,
    stagingProfileIsWallet: false as const,
    note: enabled
      ? "Wallet authentication is on, but this workspace still does not attach a signed session."
      : "Wallet authentication is paused. A staging profile is not the production wallet identity.",
  };
}
