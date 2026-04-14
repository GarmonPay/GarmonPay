"use client";

import { useEffect, useState } from "react";
import { getSessionAsync } from "@/lib/session";
import { useCoins } from "@/hooks/useCoins";

export function DashboardCoinBalances() {
  const [hasToken, setHasToken] = useState(false);
  const { sweepsCoins, goldCoins } = useCoins();

  useEffect(() => {
    getSessionAsync().then((s) => setHasToken(!!s?.accessToken));
  }, []);

  if (!hasToken) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
      <span
        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-100/95"
        title="Gold Coins"
      >
        <span aria-hidden>🪙</span>
        <span className="font-semibold tabular-nums">{goldCoins.toLocaleString()}</span>
        <span className="text-amber-200/70">GC</span>
      </span>
      <span
        className="inline-flex items-center gap-1 rounded-lg border border-[#7C3AED]/45 bg-[#7C3AED]/12 px-2 py-1 text-violet-50"
        title="$GPAY balance"
      >
        <span aria-hidden>⚡</span>
        <span className="font-semibold tabular-nums text-violet-100">{sweepsCoins.toLocaleString()}</span>
        <span className="font-medium text-[#7C3AED]">$GPAY</span>
      </span>
    </div>
  );
}
