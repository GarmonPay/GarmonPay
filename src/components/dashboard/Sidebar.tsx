"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/transactions", label: "Transactions" },
  { href: "/dashboard/fight-arena", label: "Fight Arena" },
  { href: "/dashboard/games", label: "Games" },
  { href: "/dashboard/rewards", label: "Rewards" },
  { href: "/dashboard/earnings", label: "Earnings" },
  { href: "/dashboard/ads", label: "Ads" },
  { href: "/dashboard/ads/create", label: "Create Ad" },
  { href: "/dashboard/banners", label: "Banners" },
  { href: "/dashboard/withdraw", label: "Withdraw" },
  { href: "/dashboard/leaderboard", label: "Leaderboard" },
  { href: "/dashboard/tournaments", label: "Tournaments" },
  { href: "/dashboard/teams", label: "Teams" },
  { href: "/dashboard/referrals", label: "Referrals" },
  { href: "/dashboard/finance", label: "Finance" },
  { href: "/dashboard/settings", label: "Settings" },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    } else {
      try {
        await logout();
      } finally {
        clearSession();
      }
    }
    onNavigate?.();
    router.push("/");
  }

  return (
    <aside className="w-56 shrink-0 border-r border-white/[0.06] bg-fintech-bg-card/50 py-4 px-3">
      <nav className="flex flex-col gap-0.5">
        {nav.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className="px-3 py-2 rounded-lg text-sm font-medium text-fintech-muted hover:text-white hover:bg-white/5"
          >
            {label}
          </Link>
        ))}
        <button
          type="button"
          onClick={handleLogout}
          className="mt-2 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 text-left w-full"
        >
          Log out
        </button>
      </nav>
    </aside>
  );
}
