"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string };

type NavSection = { title: string; links: NavLink[] };

const sections: NavSection[] = [
  {
    title: "Overview",
    links: [{ href: "/admin/dashboard", label: "Dashboard" }],
  },
  {
    title: "Earn",
    links: [
      { href: "/admin/videos", label: "Videos" },
      { href: "/admin/creators", label: "Creators" },
    ],
  },
  {
    title: "Money",
    links: [
      { href: "/admin/finance", label: "Platform Finance" },
      { href: "/admin/wallet", label: "Wallet & Balances" },
      { href: "/admin/transactions", label: "Transactions" },
    ],
  },
  {
    title: "Users",
    links: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/security", label: "Security" },
    ],
  },
  {
    title: "Games",
    links: [
      { href: "/admin/gamification", label: "Gamification" },
      { href: "/admin/tournaments", label: "Tournaments" },
      { href: "/admin/arena", label: "Arena" },
      { href: "/admin/celo-audit", label: "C-Lo Audit" },
    ],
  },
  {
    title: "Growth",
    links: [
      { href: "/admin/referrals", label: "Referrals" },
      { href: "/admin/membership-bonuses", label: "Membership Bonuses" },
      { href: "/admin/banners", label: "Banners" },
      { href: "/admin/marketing-ads", label: "Marketing Ads" },
    ],
  },
  {
    title: "Settings",
    links: [
      { href: "/admin/config", label: "Platform Config" },
      { href: "/admin/launch-checklist", label: "Pre-Launch Checklist" },
    ],
  },
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
      <nav className="flex-1 overflow-y-auto md:overflow-visible space-y-4 -mx-1 px-1 md:mx-0 md:px-0">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="hidden md:block px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">
              {section.title}
            </p>
            <div className="flex flex-row md:flex-col gap-0.5 overflow-x-auto md:overflow-visible scrollbar-thin pb-2 md:pb-0">
              {section.links.map(({ href, label }) => {
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
            </div>
          </div>
        ))}
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
