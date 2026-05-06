"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardCoinBalances } from "@/components/DashboardCoinBalances";
import { GarmonPayWordmark } from "@/components/GarmonPayWordmark";
import { APP_SHELL_LINKS } from "@/config/app-shell-nav";

function HeaderNavIcons({ className }: { className?: string }) {
  const iconBtn =
    "flex h-9 min-h-[36px] w-9 min-w-[36px] items-center justify-center rounded-md text-base leading-none text-white/80 transition-colors hover:bg-white/10 hover:text-white tablet:h-9 tablet:min-h-[36px] tablet:w-9 tablet:min-w-[36px]";
  return (
    <div className={`flex shrink-0 items-center gap-0.5 ${className ?? ""}`}>
      <Link href="/dashboard/notifications" className={iconBtn} aria-label="Notifications">
        🔔
      </Link>
      <Link href="/dashboard/profile" className={iconBtn} aria-label="Profile">
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
        <div className="mx-auto max-w-7xl px-3 py-1">
          <div className="flex flex-col gap-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <GarmonPayWordmark href={APP_SHELL_LINKS.home} className="!text-lg leading-none" />
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
        <div className="mx-auto flex min-w-0 max-w-7xl items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2">
          <GarmonPayWordmark href={APP_SHELL_LINKS.home} className="!text-lg leading-none" />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
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
