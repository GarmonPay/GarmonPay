"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_SHELL_LINKS } from "@/config/app-shell-nav";

const tabs: {
  href: string;
  label: string;
  icon: string;
  isActive: (p: string) => boolean;
}[] = [
  {
    href: APP_SHELL_LINKS.home,
    label: "Dashboard",
    icon: "🏠",
    isActive: (p) => p === APP_SHELL_LINKS.home,
  },
  {
    href: APP_SHELL_LINKS.gamesLobby,
    label: "Games",
    icon: "🎮",
    isActive: (p) =>
      p.startsWith("/dashboard/games") ||
      p.startsWith("/games") ||
      p.startsWith("/dashboard/coin-flip") ||
      p.startsWith("/dashboard/coinflip") ||
      p.startsWith("/dashboard/arena"),
  },
  {
    href: APP_SHELL_LINKS.earnRoot,
    label: "Earn",
    icon: "📺",
    isActive: (p) =>
      p.startsWith("/dashboard/earn") ||
      p.startsWith(APP_SHELL_LINKS.referral) ||
      p.startsWith(APP_SHELL_LINKS.referrals),
  },
  {
    href: APP_SHELL_LINKS.buyGc,
    label: "Coins",
    icon: "🛒",
    isActive: (p) =>
      p.startsWith("/dashboard/coins/buy") ||
      p.startsWith("/dashboard/buy-coins") ||
      p.startsWith(APP_SHELL_LINKS.convert),
  },
  {
    href: APP_SHELL_LINKS.profile,
    label: "Profile",
    icon: "👤",
    isActive: (p) =>
      p.startsWith(APP_SHELL_LINKS.profile) || p.startsWith(APP_SHELL_LINKS.settings),
  },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] border-t border-[rgba(124,58,237,0.35)] bg-[#07010f]/98 backdrop-blur-md tablet:hidden"
      style={{
        minHeight: "72px",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 10px)",
        paddingTop: "10px",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
      aria-label="Bottom navigation"
    >
      <div className="mx-auto flex w-full max-w-[430px] items-center justify-between gap-0.5 px-1.5">
        {tabs.map(({ href, label, icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-touch min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-semibold transition-all sm:text-[11px] ${
                active
                  ? "bg-[rgba(245,200,66,0.12)] text-[#F5C842] shadow-[inset_0_0_0_1px_rgba(245,200,66,0.35)]"
                  : "text-white/45 hover:bg-white/[0.04] hover:text-white/85"
              } active:scale-[0.97]`}
              style={{ minHeight: "52px" }}
            >
              <span className={`text-xl leading-none ${active ? "drop-shadow-[0_0_10px_rgba(245,200,66,0.35)]" : ""}`} aria-hidden>
                {icon}
              </span>
              <span className="max-w-[4.5rem] truncate text-center leading-tight tracking-wide">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
