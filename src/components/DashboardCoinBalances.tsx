"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSessionAsync } from "@/lib/session";
import { useCoins } from "@/hooks/useCoins";

export function DashboardCoinBalances() {
  const [hasToken, setHasToken] = useState(false);
  const { sweepsCoins, goldCoins, usdBalance, formatUSD } = useCoins();

  useEffect(() => {
    getSessionAsync().then((s) => setHasToken(!!s?.accessToken));
  }, []);

  if (!hasToken) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
      <span className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-violet-100/95" title="GPay Coins">
        <span aria-hidden>⭐</span>
        <span className="font-semibold tabular-nums">{sweepsCoins.toLocaleString()}</span>
        <span className="text-violet-200/70">GPC</span>
      </span>
      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-100/95" title="Gold Coins">
        <span aria-hidden>🪙</span>
        <span className="font-semibold tabular-nums">{goldCoins.toLocaleString()}</span>
        <span className="text-amber-200/70">GC</span>
      </span>
      <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-100/95" title="USD wallet">
        <span aria-hidden>💵</span>
        <span className="font-semibold tabular-nums">{formatUSD(usdBalance)}</span>
        <span className="text-emerald-200/70">USD</span>
      </span>
      <Link
        href="/dashboard/wallet"
        className="inline-flex items-center rounded-lg border border-[#F5C842]/40 bg-[#F5C842]/10 px-2.5 py-1 text-[11px] font-semibold text-[#F5C842] hover:bg-[#F5C842]/15 transition-colors"
      >
        Get More GPay Coins
      </Link>
    </div>
  );
}
