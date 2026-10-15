/** Financial activation requires a separate reviewed release, never a public env toggle. */
export const SOLANA_POLICY = Object.freeze({
  currency: "SOL", launchFeeLamports: "50000000", creatorClaimFeeBps: 0,
  desiredMintSuffix: null, launchProvider: "Raydium LaunchLab",
  walletAuthentication: true, deposits: false,
  tokenLaunches: false, trading: false, custody: false, withdrawals: false,
  advertisingFunding: false, tokenRewards: false, referralPayouts: false, paidGames: false,
  tradingFee: { status: "approved_devnet_mainnet_paused", totalBps: 175, platformBps: 120, creatorBps: 30 },
});
export function walletAuthEnabled() { return SOLANA_POLICY.walletAuthentication; }
export const SOLANA_SESSION_COOKIE = "gp-solana-session";
export const SOLANA_CHALLENGE_COOKIE = "gp-solana-challenge";
