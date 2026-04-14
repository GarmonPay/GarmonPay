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
      className="fixed bottom-0 left-0 right-0 z-[100] border-t border-[rgba(124,58,237,0.3)] bg-[#0a0118]/95 backdrop-blur-sm tablet:hidden"
      style={{
        minHeight: "70px",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
        paddingTop: "8px",
      }}
      aria-label="Bottom navigation"
    >
      <div className="mx-auto flex w-full max-w-[430px] items-center justify-around px-1">
        {tabs.map(({ href, label, icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-touch min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-medium transition-all sm:text-xs ${
                active
                  ? "text-[#F5C842]"
                  : "text-white/50 hover:text-white"
              } active:scale-95`}
              style={{ minHeight: "48px" }}
            >
              <span className="text-lg leading-none" aria-hidden>
                {icon}
              </span>
              <span className="truncate text-center">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
