"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { useCoins } from "@/hooks/useCoins";

export function DashboardCoinBalances() {
  const [hasToken, setHasToken] = useState(false);
  const { goldCoins, gpayCoins, gpayTokens, loading } = useCoins();

  useEffect(() => {
    getSessionAsync().then((s) => setHasToken(!!s?.accessToken));
  }, []);

  if (!hasToken) return null;

  return (
    <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0e0118]/95 p-4 shadow-lg">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80 mb-3">
        Your wallet
      </p>
      {loading ? (
        <p className="text-xs text-fintech-muted">Loading…</p>
      ) : (
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between items-center gap-2">
            <span className="text-amber-200/90">
              <span aria-hidden>🪙</span> Gold Coins
            </span>
            <span className="font-mono font-semibold tabular-nums text-[#F5C842]">
              {goldCoins.toLocaleString()} GC
            </span>
          </li>
          <li className="flex justify-between items-center gap-2">
            <span className="text-violet-200/90">
              <span aria-hidden>💜</span> GPay Coins
            </span>
            <span className="font-mono font-semibold tabular-nums text-[#A855F7]">
              {gpayCoins.toLocaleString()} GPC
            </span>
          </li>
          <li className="flex justify-between items-center gap-2">
            <span className="text-emerald-200/90">
              <span aria-hidden>⬡</span> $GPAY Tokens
            </span>
            <span className="font-mono font-semibold tabular-nums text-[#10B981]">
              {gpayTokens.toLocaleString()} $GPAY
            </span>
          </li>
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/dashboard/wallet"
          className="inline-flex flex-1 min-w-[4.5rem] justify-center rounded-lg bg-[#F5C842]/90 px-2 py-1.5 text-[11px] font-bold text-black hover:bg-[#F5C842]"
        >
          Buy GC
        </Link>
        <Link
          href="/dashboard/wallet#convert"
          className="inline-flex flex-1 min-w-[4.5rem] justify-center rounded-lg border border-[#A855F7]/50 bg-[#A855F7]/15 px-2 py-1.5 text-[11px] font-semibold text-violet-100 hover:bg-[#A855F7]/25"
        >
          Convert
        </Link>
        <Link
          href="/dashboard/wallet#redeem"
          className="inline-flex flex-1 min-w-[4.5rem] justify-center rounded-lg border border-[#10B981]/50 bg-[#10B981]/15 px-2 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-[#10B981]/25"
        >
          Redeem
        </Link>
      </div>
    </div>
  );
}
