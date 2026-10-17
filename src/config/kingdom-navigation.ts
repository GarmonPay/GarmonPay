import { SOLANA_NAVIGATION } from "./solana-navigation";
/** Shared destinations for the kingdom header, sidebar, and mobile bar. */
export const KINGDOM_SIDE = [
  { href: "/", label: "Home" },
  { href: "/solana/spotlight", label: "Discover Coins" },
  { href: "/solana/launchpad", label: "Launchpad" },
  { href: "/solana/trade", label: "Trade" },
  { href: "/member/paper", label: "Paper Trading" },
  { href: "/solana/earn", label: "Earn" },
  { href: "/solana/advertise", label: "Advertise" },
  { href: "/games", label: "Games" },
  { href: "/member/community", label: "Community" },
  { href: "/member/referrals", label: "Referrals" },
  { href: "/member/traders", label: "Leaderboards" },
  { href: "/dashboard/arena/tournaments", label: "Contests · legacy account" },
  { href: "/solana/wallet", label: "Wallet" },
  { href: "/member", label: "Member Dashboard" },
  { href: "/solana/members", label: "Profile & Settings" },
] as const;

export const KINGDOM_BOTTOM = [
  { href: "/", label: "Home" },
  { href: "/solana/spotlight", label: "Discover" },
  { href: "/solana/launchpad", label: "Launchpad" },
  { href: "/solana/trade", label: "Trade" },
  { href: "/solana/earn", label: "Earn" },
] as const;

export const KINGDOM_MENU_EXTRA = [
  { href: "/member/paper", label: "Paper Trading" },
  { href: "/member/referrals", label: "Referrals" },
  { href: "/member/watch", label: "Watch & Earn" },
  { href: "/member/advertising", label: "Advertising workspace" },
  { href: "/member/traders", label: "Top traders" },
  { href: "/member/create", label: "Coin creator" },
  { href: "/solana/learn", label: "Learn" },
  { href: "/solana/spotlight", label: "Explore Coins" },
  { href: "/dashboard/notifications", label: "Notifications" },
] as const;

export function kingdomCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/member") return pathname === "/member";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** One destination per menu; public, member and mobile chrome share these links. */
export const KINGDOM_MENU = [...SOLANA_NAVIGATION, ...KINGDOM_SIDE, ...KINGDOM_MENU_EXTRA]
  .filter((item, index, rows) => rows.findIndex(other => other.href === item.href) === index);
export const KINGDOM_MORE = KINGDOM_MENU.filter(item => !SOLANA_NAVIGATION.slice(0, 8).some(primary => primary.href === item.href));
