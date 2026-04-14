/**
 * Canonical app-shell URLs. Sidebar and mobile bottom nav must use these
 * hrefs so navigation stays consistent.
 */
export const APP_SHELL_LINKS = {
  home: "/dashboard",
  gamesLobby: "/games",
  celo: "/dashboard/games/celo",
  coinFlip: "/dashboard/coinflip",
  arena: "/dashboard/arena",
  earnRoot: "/dashboard/earn",
  earnAds: "/dashboard/earn/ads",
  earnSocial: "/dashboard/earn/social",
  referral: "/dashboard/referral",
  referrals: "/dashboard/referrals",
  buyGc: "/dashboard/coins/buy",
  convert: "/dashboard/convert",
  profile: "/dashboard/profile",
  settings: "/dashboard/settings",
} as const;
