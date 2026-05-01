"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/withdrawals", label: "Withdrawals" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/rewards", label: "Rewards" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/ads", label: "Ads" },
  { href: "/admin/garmon-ads", label: "Garmon Ads" },
  { href: "/admin/ad-packages", label: "Ad packages" },
  { href: "/admin/banners", label: "Banners" },
  { href: "/admin/social-tasks", label: "Social tasks" },
  { href: "/admin/earnings", label: "Earnings" },
  { href: "/admin/profit", label: "Profit" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/gamification", label: "Gamification" },
  { href: "/admin/tournaments", label: "Tournaments" },
  { href: "/admin/referrals", label: "Referrals" },
  { href: "/admin/membership-bonuses", label: "Membership bonuses" },
  { href: "/admin/platform", label: "Platform" },
  { href: "/admin/wallet-monitor", label: "Wallet" },
  { href: "/admin/balance-monitor", label: "Balance Monitor" },
  { href: "/admin/celo-audit", label: "C-Lo audit" },
  { href: "/admin/arena", label: "Arena" },
  { href: "/admin/security", label: "Security" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/admin/logout", { method: "POST", credentials: "include" });
    window.location.href = "/admin/login";
  }

  return (
    <aside className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-white/[0.06] bg-fintech-bg-card/50 flex flex-col md:min-h-screen py-4 px-3">
      <div className="mb-3 md:mb-4 pb-3 border-b border-white/[0.06] md:border-b-0 md:pb-0">
        <Link href="/admin/dashboard" className="text-lg font-bold text-white">
          GarmonPay Admin
        </Link>
      </div>
      <nav className="flex-1 flex flex-row md:flex-col gap-0.5 overflow-x-auto md:overflow-visible scrollbar-thin pb-2 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0">
        {links.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "text-white bg-[#7c3aed]/25 border border-[#7c3aed]/35"
                  : "text-fintech-muted hover:text-white hover:bg-white/5"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-3 border-t border-white/[0.06] hidden md:block">
        <button
          type="button"
          onClick={handleLogout}
          className="mt-2 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 text-left w-full"
        >
          Log out
        </button>
        <Link
          href="/"
          className="block mt-1 px-3 py-2 rounded-lg text-sm font-medium text-fintech-muted hover:text-white hover:bg-white/5"
        >
          Back to site
        </Link>
      </div>
      <div className="pt-3 border-t border-white/[0.06] md:hidden flex gap-2">
        <button
          type="button"
          onClick={handleLogout}
          className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          Log out
        </button>
        <Link
          href="/"
          className="flex-1 text-center px-3 py-2 rounded-lg text-sm font-medium text-fintech-muted hover:text-white hover:bg-white/5 border border-white/10"
        >
          Site
        </Link>
      </div>
    </aside>
  );
}
