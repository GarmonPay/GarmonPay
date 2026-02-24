"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/dashboard", label: "Dashboard", icon: "◉" },
  { href: "/dashboard/games", label: "Games", icon: "🎮" },
  { href: "/dashboard/earnings", label: "Earnings", icon: "¢" },
  { href: "/dashboard/referrals", label: "Referrals", icon: "↗" },
  { href: "/dashboard/settings", label: "Profile", icon: "☷" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="glass-bar fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/[0.06] safe-area-pb shadow-soft"
      style={{
        minHeight: "56px",
        paddingBottom: "max(env(safe-area-inset-bottom, 0), 8px)",
        paddingTop: "8px",
      }}
    >
      {tabs.map(({ href, label, icon }) => {
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`btn-press flex min-h-touch flex-col items-center justify-center gap-0.5 px-2 py-2 text-xs font-medium transition-all duration-app min-w-[52px] rounded-xl ${
              active ? "text-fintech-accent" : "text-fintech-muted"
            } hover:text-white active:scale-95`}
            style={{ minHeight: "48px" }}
          >
            <span className="text-lg leading-none" aria-hidden>{icon}</span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
