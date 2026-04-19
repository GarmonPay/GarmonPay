"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardCoinBalances } from "@/components/DashboardCoinBalances";

export function DashboardHeader() {
  const pathname = usePathname();
  const isCeloLobby = pathname === "/dashboard/games/celo";

  return (
    <header
      className={`glass-bar w-full shrink-0 border-b shadow-soft ${
        isCeloLobby ? "border-violet-500/15 bg-[#050008]/90" : "border-white/[0.06]"
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-2 gap-y-2 px-4 py-2 sm:px-6 tablet:gap-4 ${
          isCeloLobby ? "tablet:py-2.5" : "tablet:py-3"
        }`}
      >
        <Link
          href="/dashboard"
          className="shrink-0 text-lg font-bold tracking-tight text-[#F5C842] no-underline hover:opacity-90 tablet:text-xl"
        >
          GarmonPay
        </Link>

        <div className="hidden min-w-0 flex-1 tablet:block" aria-hidden />

        <div className="flex w-full min-w-0 basis-full flex-wrap items-center justify-end gap-1.5 tablet:basis-auto tablet:w-auto tablet:flex-nowrap tablet:gap-2 sm:gap-3">
          {/* Compact everywhere: full wallet card was overlapping hero/welcome on mobile */}
          <DashboardCoinBalances compact />
          <Link
            href="/dashboard/notifications"
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg text-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white tablet:min-h-[44px] tablet:min-w-[44px]"
            aria-label="Notifications"
          >
            🔔
          </Link>
          <Link
            href="/dashboard/profile"
            className="hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white tablet:flex"
            aria-label="Profile"
          >
            👤
          </Link>
        </div>
      </div>
    </header>
  );
}
