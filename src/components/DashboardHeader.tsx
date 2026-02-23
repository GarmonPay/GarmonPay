"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/rewards", label: "Rewards" },
  { href: "/dashboard/earnings", label: "Earnings" },
  { href: "/dashboard/ads", label: "Ads" },
  { href: "/dashboard/banners", label: "Banners" },
  { href: "/dashboard/withdraw", label: "Withdraw" },
  { href: "/dashboard/transactions", label: "Transactions" },
  { href: "/dashboard/leaderboard", label: "Leaderboard" },
  { href: "/dashboard/referrals", label: "Referrals" },
  { href: "/dashboard/finance", label: "Finance" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardHeader() {
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
    router.push("/");
  }

  return (
    <header className="border-b border-white/10 bg-fintech-bg-card/80 backdrop-blur" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(17,24,39,0.9)" }}>
      <div className="max-w-7xl mx-auto px-4 py-4" style={{ maxWidth: "80rem", marginLeft: "auto", marginRight: "auto", padding: "1rem 1.5rem" }}>
        <div className="flex flex-wrap items-center justify-between gap-4" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <Link href="/dashboard" className="text-xl font-bold text-white" style={{ color: "#fff", fontSize: "1.25rem", fontWeight: 700, textDecoration: "none" }}>
            GarmonPay
          </Link>
          <nav className="flex flex-wrap items-center gap-1 sm:gap-2" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.25rem" }}>
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-2 rounded-lg text-sm font-medium text-fintech-muted hover:text-white hover:bg-white/5"
                style={{ color: "#6b7280", padding: "0.5rem 0.75rem", borderRadius: "0.5rem", fontSize: "0.875rem", textDecoration: "none" }}
              >
                {label}
              </Link>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10"
              style={{ color: "#f87171", padding: "0.5rem 0.75rem", borderRadius: "0.5rem", fontSize: "0.875rem", background: "transparent", border: "none", cursor: "pointer" }}
            >
              Logout
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
