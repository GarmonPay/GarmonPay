"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { useCoins } from "@/hooks/useCoins";
import { localeInt } from "@/lib/format-number";

export function DashboardCoinBalances({ compact = false }: { compact?: boolean }) {
  const [hasToken, setHasToken] = useState(false);
  const { goldCoins, gpayCoins, gpayTokens, loading } = useCoins();

  useEffect(() => {
    getSessionAsync().then((s) => setHasToken(!!s?.accessToken));
  }, []);

  if (!hasToken) return null;

  if (compact) {
    return (
      <div className="w-full min-w-0 tablet:max-w-[min(92vw,32rem)]">
        {loading ? (
          <span className="text-[10px] text-fintech-muted tablet:text-[11px]">Loading…</span>
        ) : (
          <div className="flex flex-col gap-1 tablet:flex-row tablet:flex-wrap tablet:items-center tablet:justify-end tablet:gap-2">
            <div
              className="grid w-full grid-cols-3 gap-1 tablet:flex tablet:w-auto tablet:flex-wrap tablet:justify-end tablet:gap-1.5"
              role="group"
              aria-label="Wallet summary: Gold Coins, GPay Coins, GPAY Tokens"
            >
              <div
                className="rounded-md border border-amber-500/20 bg-black/50 px-1.5 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-amber-400/35 tablet:rounded-lg tablet:px-2 tablet:py-1"
                title="Gold Coins"
              >
                <span className="text-[8px] font-bold uppercase tracking-wider text-amber-200/70 tablet:text-[9px]">
                  Gold
                </span>
                <span className="ml-1 font-mono text-[11px] font-semibold tabular-nums text-amber-300 tablet:ml-1.5 tablet:text-[12px]">
                  {localeInt(goldCoins)}
                </span>
              </div>
              <div
                className="rounded-md border border-violet-500/25 bg-black/50 px-1.5 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-violet-400/40 tablet:rounded-lg tablet:px-2 tablet:py-1"
                title="GPay Coins (GPC)"
              >
                <span className="text-[8px] font-bold uppercase tracking-wider text-violet-300/80 tablet:text-[9px]">
                  GPC
                </span>
                <span className="ml-1 font-mono text-[11px] font-semibold tabular-nums text-violet-200 tablet:ml-1.5 tablet:text-[12px]">
                  {localeInt(gpayCoins)}
                </span>
              </div>
              <div
                className="rounded-md border border-emerald-500/20 bg-black/50 px-1.5 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-emerald-400/35 tablet:rounded-lg tablet:px-2 tablet:py-1"
                title="$GPAY Tokens"
              >
                <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-300/75 tablet:text-[9px]">
                  $GPAY
                </span>
                <span className="ml-1 font-mono text-[11px] font-semibold tabular-nums text-emerald-200 tablet:ml-1.5 tablet:text-[12px]">
                  {localeInt(gpayTokens)}
                </span>
              </div>
            </div>
            <div className="grid w-full grid-cols-3 gap-1 tablet:flex tablet:w-auto tablet:flex-wrap tablet:justify-end tablet:gap-1">
              <Link
                href="/dashboard/wallet"
                className="inline-flex min-h-[32px] items-center justify-center rounded-md bg-gradient-to-b from-amber-100 to-amber-600 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#0a0610] shadow-sm ring-1 ring-amber-300/40 transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-amber-400/50 tablet:min-h-[36px] tablet:rounded-lg tablet:px-2.5 tablet:py-1.5 tablet:text-[10px]"
              >
                Buy GC
              </Link>
              <Link
                href="/dashboard/wallet#convert"
                className="inline-flex min-h-[32px] items-center justify-center rounded-md border border-violet-500/45 bg-violet-950/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-violet-100 transition hover:border-violet-400/60 hover:bg-violet-900/80 focus:outline-none focus:ring-2 focus:ring-violet-500/40 tablet:min-h-[36px] tablet:rounded-lg tablet:px-2.5 tablet:py-1.5 tablet:text-[10px]"
              >
                Convert
              </Link>
              <Link
                href="/dashboard/wallet#redeem"
                className="inline-flex min-h-[32px] items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-950/50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-100 transition hover:border-emerald-400/55 hover:bg-emerald-900/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/35 tablet:min-h-[36px] tablet:rounded-lg tablet:px-2.5 tablet:py-1.5 tablet:text-[10px]"
              >
                Redeem
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0e0118]/95 p-4 shadow-lg">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-violet-400/80">Your wallet</p>
      {loading ? (
        <p className="text-xs text-fintech-muted">Loading…</p>
      ) : (
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between gap-2">
            <span className="text-amber-200/90">
              <span aria-hidden>🪙</span> Gold Coins
            </span>
            <span className="font-mono font-semibold tabular-nums text-[#F5C842]">
              {localeInt(goldCoins)} GC
            </span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="text-violet-200/90">
              <span aria-hidden>💜</span> GPay Coins
            </span>
            <span className="font-mono font-semibold tabular-nums text-[#A855F7]">
              {localeInt(gpayCoins)} GPC
            </span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="text-emerald-200/90">
              <span aria-hidden>⬡</span> $GPAY Tokens
            </span>
            <span className="font-mono font-semibold tabular-nums text-[#10B981]">
              {localeInt(gpayTokens)} $GPAY
            </span>
          </li>
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/dashboard/wallet"
          className="inline-flex min-w-[4.5rem] flex-1 justify-center rounded-lg bg-[#F5C842]/90 px-2 py-1.5 text-[11px] font-bold text-black hover:bg-[#F5C842]"
        >
          Buy GC
        </Link>
        <Link
          href="/dashboard/wallet#convert"
          className="inline-flex min-w-[4.5rem] flex-1 justify-center rounded-lg border border-[#A855F7]/50 bg-[#A855F7]/15 px-2 py-1.5 text-[11px] font-semibold text-violet-100 hover:bg-[#A855F7]/25"
        >
          Convert
        </Link>
        <Link
          href="/dashboard/wallet#redeem"
          className="inline-flex min-w-[4.5rem] flex-1 justify-center rounded-lg border border-[#10B981]/50 bg-[#10B981]/15 px-2 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-[#10B981]/25"
        >
          Redeem
        </Link>
      </div>
    </div>
  );
}
