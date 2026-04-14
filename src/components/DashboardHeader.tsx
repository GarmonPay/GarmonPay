"use client";

import Link from "next/link";
import { DashboardCoinBalances } from "@/components/DashboardCoinBalances";

export function DashboardHeader() {
  return (
    <header className="glass-bar shrink-0 border-b border-white/[0.06] shadow-soft">
      <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between gap-2 px-4 tablet:h-auto tablet:min-h-0 tablet:gap-4 tablet:py-3 sm:px-6">
        <Link
          href="/dashboard"
          className="shrink-0 text-lg font-bold tracking-tight text-[#F5C842] no-underline hover:opacity-90 tablet:text-xl"
        >
          GarmonPay
        </Link>

        <div className="min-w-0 flex-1" aria-hidden />

        <div className="flex shrink-0 items-center gap-1.5 tablet:gap-2 sm:gap-3">
          <DashboardCoinBalances />
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
