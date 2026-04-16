"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardCoinBalances } from "@/components/DashboardCoinBalances";

export function DashboardHeader() {
  const pathname = usePathname();
  const isCeloLobby = pathname === "/dashboard/games/celo";

  return (
    <header
      className={`glass-bar shrink-0 border-b shadow-soft ${
        isCeloLobby ? "border-violet-500/15 bg-[#050008]/90" : "border-white/[0.06]"
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 ${
          isCeloLobby
            ? "min-h-[52px] py-2 tablet:min-h-0 tablet:py-2.5"
            : "h-[60px] tablet:h-auto tablet:min-h-0 tablet:gap-4 tablet:py-3"
        }`}
      >
        <Link
          href="/dashboard"
          className="shrink-0 text-lg font-bold tracking-tight text-[#F5C842] no-underline hover:opacity-90 tablet:text-xl"
        >
          GarmonPay
        </Link>

        <div className="min-w-0 flex-1" aria-hidden />

        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 tablet:gap-2 sm:gap-3">
          <DashboardCoinBalances compact={isCeloLobby} />
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
