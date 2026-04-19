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
  const pathname = usePathname();
  const isCeloLobby = pathname === "/dashboard/games/celo";

  return (
    <header
      className={`glass-bar w-full shrink-0 border-b shadow-soft ${
        isCeloLobby ? "border-violet-500/15 bg-[#050008]/90" : "border-white/[0.06]"
      }`}
    >
      {/* Mobile / small: tight rows — title + icons, then wallet (see DashboardCoinBalances) */}
      <div className="tablet:hidden">
        <div className="mx-auto max-w-7xl px-3 py-1.5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <Link
                href="/dashboard"
                className="shrink-0 text-base font-bold tracking-tight text-[#F5C842] no-underline hover:opacity-90"
              >
                GarmonPay
              </Link>
              <HeaderNavIcons />
            </div>
            <DashboardCoinBalances compact />
          </div>
        </div>
      </div>

      {/* Desktop / tablet: original single-row layout */}
      <div className="hidden tablet:block">
        <div
          className={`mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-6 ${
            isCeloLobby ? "py-2.5" : "py-3"
          }`}
        >
          <Link
            href="/dashboard"
            className="shrink-0 text-lg font-bold tracking-tight text-[#F5C842] no-underline hover:opacity-90 tablet:text-xl"
          >
            GarmonPay
          </Link>

          <div className="hidden min-w-0 flex-1 tablet:block" aria-hidden />

          <div className="flex min-w-0 flex-nowrap items-center justify-end gap-2 sm:gap-3">
            <DashboardCoinBalances compact />
            <HeaderNavIcons />
          </div>
        </div>
      </div>
    </header>
  );
}
