"use client";

import Link from "next/link";
import { DashboardCoinBalances } from "@/components/DashboardCoinBalances";

export function DashboardHeader() {
  return (
    <header className="glass-bar border-b border-white/[0.06] shadow-soft">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/dashboard"
          className="shrink-0 text-xl font-bold tracking-tight text-[#F5C842] no-underline hover:opacity-90"
        >
          GarmonPay
        </Link>

        <div className="min-w-0 flex-1" aria-hidden />

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <DashboardCoinBalances />
          <Link
            href="/dashboard/notifications"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Notifications"
          >
            🔔
          </Link>
          <Link
            href="/dashboard/profile"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Profile"
          >
            👤
          </Link>
        </div>
      </div>
    </header>
  );
}
