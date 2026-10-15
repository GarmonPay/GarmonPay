import { walletAuthEnabled } from "@/lib/solana/policy";

/**
 * Production members are identified by a signed wallet session.
 * This contract does not read cookies, create sessions, or turn wallet authentication on.
 */
export function memberIdentityContract(connected = false) {
  const enabled = walletAuthEnabled();
  return {
    productionSource: "wallet-signature" as const,
    walletAuthEnabled: enabled,
    connected,
    stagingProfileIsWallet: false as const,
    note: connected
      ? "This dashboard belongs to the wallet that signed in. A browser-saved ID is not accepted."
      : enabled
        ? "Connect and sign in with your wallet to open your member dashboard. A browser-saved ID is not a member account."
        : "Wallet authentication is paused. A staging profile is not the production wallet identity.",
  };
}
