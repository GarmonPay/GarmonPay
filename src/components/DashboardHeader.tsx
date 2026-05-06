"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardCoinBalances } from "@/components/DashboardCoinBalances";

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
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-end gap-2">
              <HeaderNavIcons />
            </div>
            <DashboardCoinBalances
              compact
              hideCompactActionsOnMobile={compactWalletOnGameRoom}
            />
          </div>
        </div>
      </div>

      {/* Desktop / tablet: wallet pills + actions aligned end (sidebar has brand wordmark) */}
      <div className="hidden tablet:block">
        <div className="mx-auto flex max-w-7xl min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 px-6 py-3">
          <DashboardCoinBalances
            compact
            hideCompactActionsOnMobile={compactWalletOnGameRoom}
          />
          <HeaderNavIcons />
        </div>
      </div>
    </header>
  );
}
