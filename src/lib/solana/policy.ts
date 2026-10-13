/** Financial activation requires a separate reviewed release, never a public env toggle. */
export const SOLANA_POLICY = Object.freeze({
  currency: "SOL", launchFeeLamports: "50000000", creatorClaimFeeBps: 0,
  desiredMintSuffix: "gpay", launchProvider: "Raydium LaunchLab",
  walletAuthentication: false, deposits: false,
  tokenLaunches: false, trading: false, custody: false, withdrawals: false,
  advertisingFunding: false, tokenRewards: false, referralPayouts: false, paidGames: false,
  tradingFee: { status: "pending_protocol_verification", totalBps: 100, platformBps: 60, creatorBps: 40 },
});
export function walletAuthEnabled() { return SOLANA_POLICY.walletAuthentication; }
export const SOLANA_SESSION_COOKIE = "gp-solana-session";
export const SOLANA_CHALLENGE_COOKIE = "gp-solana-challenge";
