/**
 * Canonical app-shell URLs. Sidebar and mobile bottom nav must use these
 * hrefs so navigation stays consistent.
 */
export const APP_SHELL_LINKS = {
  home: "/dashboard",
  gamesLobby: "/games",
  gamesHub: "/dashboard/games",
  celo: "/dashboard/games/celo",
  /** Connect Four PvP lobby (same shell as other dashboard games). */
  garmonfour: "/dashboard/games/garmonfour",
  coinFlip: "/dashboard/coinflip",
  arena: "/dashboard/arena",
  earnRoot: "/dashboard/earn",
  earnWatch: "/dashboard/earn",
  createVideo: "/dashboard/create-video",
  referral: "/dashboard/referral",
  referrals: "/dashboard/referrals",
  buyGc: "/dashboard/coins/buy",
  convert: "/dashboard/convert",
  redeemGpay: "/dashboard/redeem",
  profile: "/dashboard/profile",
  settings: "/dashboard/settings",
} as const;
