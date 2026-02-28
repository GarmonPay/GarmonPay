"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

const links = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/ads", label: "Ads" },
  { href: "/admin/banners", label: "Banners" },
  { href: "/admin/withdrawals", label: "Withdrawals" },
  { href: "/admin/earnings", label: "Earnings" },
  { href: "/admin/profit", label: "Profit" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/gamification", label: "Gamification" },
  { href: "/admin/tournaments", label: "Tournaments" },
  { href: "/admin/referrals", label: "Referrals" },
  { href: "/admin/boxing", label: "Boxing" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  function handleLogout() {
    const supabase = createBrowserClient();
    if (supabase) supabase.auth.signOut();
    window.location.href = "/admin/login";
  }

  return (
    <aside className="w-56 shrink-0 border-r border-white/10 bg-[#0f172a] flex flex-col min-h-screen">
      <div className="p-4 border-b border-white/10">
        <Link href="/admin/dashboard" className="text-lg font-bold text-white">
          GarmonPay Admin
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-[#2563eb] text-white"
                  : "text-[#94a3b8] hover:bg-white/5 hover:text-white"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/10">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 text-left"
        >
          Logout
        </button>
        <Link
          href="/"
          className="block mt-2 px-3 py-2 rounded-lg text-sm text-[#94a3b8] hover:text-white"
        >
          Back to site
        </Link>
      </div>
    </aside>
  );
}
