"use client";

import Link from "next/link";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/games", label: "Games" },
  { href: "/dashboard/rewards", label: "Rewards" },
  { href: "/dashboard/earnings", label: "Earnings" },
  { href: "/dashboard/ads", label: "Ads" },
  { href: "/dashboard/banners", label: "Banners" },
  { href: "/dashboard/withdraw", label: "Withdraw" },
  { href: "/dashboard/transactions", label: "Transactions" },
  { href: "/dashboard/leaderboard", label: "Leaderboard" },
  { href: "/dashboard/tournaments", label: "Tournaments" },
  { href: "/dashboard/teams", label: "Teams" },
  { href: "/dashboard/referrals", label: "Referrals" },
  { href: "/dashboard/finance", label: "Finance" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function Sidebar() {
  return (
    <aside
      className="w-56 shrink-0 border-r border-white/10 bg-fintech-bg-card/50 py-4 px-3"
      style={{ borderRight: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(17,24,39,0.5)" }}
    >
      <nav className="flex flex-col gap-0.5">
        {nav.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="px-3 py-2 rounded-lg text-sm font-medium text-fintech-muted hover:text-white hover:bg-white/5"
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
