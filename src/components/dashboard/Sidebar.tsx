"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";

const nav: { href: string; label: string; soon?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/arena", label: "GarmonPay Arena", soon: true },
  { href: "/dashboard/transactions", label: "Transactions" },
  { href: "/dashboard/leaderboard", label: "Leaderboard" },
  { href: "/dashboard/games", label: "Games" },
  { href: "/dashboard/games/spin", label: "Spin Wheel", soon: true },
  { href: "/dashboard/games/scratch", label: "Scratch Card", soon: true },
  { href: "/dashboard/games/mystery-box", label: "Mystery Box", soon: true },
  { href: "/dashboard/games/pinball", label: "Pinball", soon: true },
  { href: "/dashboard/rewards", label: "Rewards" },
  { href: "/dashboard/earn", label: "Earn" },
  { href: "/dashboard/earn/social", label: "📱 Social Tasks" },
  { href: "/dashboard/earn/calculator", label: "Calculator" },
  { href: "/dashboard/earnings", label: "Earnings" },
  { href: "/dashboard/advertise", label: "Advertise" },
  { href: "/dashboard/ads", label: "Watch ads" },
  { href: "/dashboard/banners", label: "Banners" },
  { href: "/dashboard/withdraw", label: "Withdraw" },
  { href: "/dashboard/tournaments", label: "Tournaments" },
  { href: "/dashboard/teams", label: "Teams" },
  { href: "/dashboard/referrals", label: "Referrals" },
  { href: "/dashboard/finance", label: "Finance" },
  { href: "/dashboard/security", label: "Security" },
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
        {nav.map(({ href, label, soon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className="px-3 py-2 rounded-lg text-sm font-medium text-fintech-muted hover:text-white hover:bg-white/5 inline-flex items-center flex-wrap gap-y-1"
          >
            <span>{label}</span>
            {soon ? (
              <span className="text-xs bg-fintech-accent/20 text-fintech-accent border border-fintech-accent/30 rounded-full px-2 py-0.5 ml-2">
                Soon
              </span>
            ) : null}
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
