/** Local devnet only. Production, Vercel, and an unset flag stay closed. */
export function devnetPlatformSubmitAllowed(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" && env.VERCEL !== "1" && env.GARMONPAY_DEVNET_LAUNCH === "1" && env.SOLANA_CLUSTER === "devnet";
}
