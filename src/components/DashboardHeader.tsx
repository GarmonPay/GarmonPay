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
  const isCeloRoute = pathname?.startsWith("/dashboard/games/celo") ?? false;

  return (
    <header
      className={`w-full shrink-0 border-b shadow-soft ${
        isCeloRoute
          ? "border-purple-800/40 bg-[#0e0118] backdrop-blur-sm"
          : "glass-bar border-white/[0.06]"
      }`}
    >
      {/* Mobile / small: tight rows — title + icons, then wallet (see DashboardCoinBalances) */}
      <div className="tablet:hidden">
        <div className="mx-auto max-w-7xl px-3 py-1.5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
          <Link
            href="/dashboard"
            className={`shrink-0 text-base font-bold tracking-tight text-[#F5C842] no-underline hover:opacity-90 ${
              isCeloRoute ? "font-serif" : ""
            }`}
            style={isCeloRoute ? { fontFamily: "var(--font-cinzel-decorative), ui-serif, Georgia, serif" } : undefined}
          >
            GarmonPay
          </Link>
              <HeaderNavIcons />
            </div>
            {isCeloRoute ? (
              <div className="flex justify-end pt-0.5">
                <Link
                  href="/dashboard/wallet"
                  className="text-[11px] font-semibold text-[#f5c842] underline-offset-2 hover:underline"
                >
                  Wallet & balances
                </Link>
              </div>
            ) : (
              <DashboardCoinBalances compact />
            )}
          </div>
        </div>
      </div>

      {/* Desktop / tablet: original single-row layout */}
      <div className="hidden tablet:block">
        <div
          className={`mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-6 ${
            isCeloRoute ? "py-2.5" : "py-3"
          }`}
        >
          <Link
            href="/dashboard"
            className={`shrink-0 text-lg font-bold tracking-tight text-[#F5C842] no-underline hover:opacity-90 tablet:text-xl ${
              isCeloRoute ? "font-serif" : ""
            }`}
            style={isCeloRoute ? { fontFamily: "var(--font-cinzel-decorative), ui-serif, Georgia, serif" } : undefined}
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
