"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardCoinBalances } from "@/components/DashboardCoinBalances";
import { GarmonPayWordmark } from "@/components/GarmonPayWordmark";
import { APP_SHELL_LINKS } from "@/config/app-shell-nav";

function HeaderNavIcons({ className }: { className?: string }) {
  return (
    <div className={`flex shrink-0 items-center gap-0.5 ${className ?? ""}`}>
      <Link
        href="/dashboard/notifications"
        className="flex h-10 min-h-[40px] w-10 min-w-[40px] items-center justify-center rounded-lg text-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white tablet:h-11 tablet:min-h-[44px] tablet:min-w-[44px] tablet:w-11 tablet:text-xl"
        aria-label="Notifications"
      >
        🔔
      </Link>
      <Link
        href="/dashboard/profile"
        className="flex h-10 min-h-[40px] w-10 min-w-[40px] items-center justify-center rounded-lg text-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white tablet:h-11 tablet:min-h-[44px] tablet:min-w-[44px] tablet:w-11 tablet:text-xl"
        aria-label="Profile"
      >
        👤
      </Link>
    </div>
  );
}

export function DashboardHeader() {
  const pathname = usePathname() ?? "";
  const compactWalletOnGameRoom =
    pathname.startsWith("/dashboard/games/celo/") && pathname !== "/dashboard/games/celo";

  return (
    <header className="w-full shrink-0 border-b shadow-soft glass-bar border-white/[0.06]">
      {/* Mobile / small: icons row, then wallet (see DashboardCoinBalances) */}
      <div className="tablet:hidden">
        <div className="mx-auto max-w-7xl px-3 py-1.5">
          <div className="flex flex-col gap-1.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <GarmonPayWordmark href={APP_SHELL_LINKS.home} />
              <HeaderNavIcons />
            </div>
            <DashboardCoinBalances
              compact
              hideCompactActionsOnMobile={compactWalletOnGameRoom}
            />
          </div>
        </div>
      </div>

      <div className="hidden tablet:block">
        <div className="mx-auto flex min-w-0 max-w-7xl items-center justify-between gap-x-4 gap-y-2 px-6 py-3">
          <GarmonPayWordmark href={APP_SHELL_LINKS.home} />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
            <DashboardCoinBalances
              compact
              hideCompactActionsOnMobile={compactWalletOnGameRoom}
            />
            <HeaderNavIcons />
          </div>
        </div>
      </div>
    </header>
  );
}
