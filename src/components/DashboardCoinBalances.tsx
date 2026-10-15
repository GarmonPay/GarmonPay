"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { useCoins } from "@/hooks/useCoins";
import { localeInt } from "@/lib/format-number";

export function DashboardCoinBalances({
  compact = false,
  /** When set with `compact`, hides Buy/Convert/Redeem on small screens. */
  hideCompactActionsOnMobile = false,
}: {
  compact?: boolean;
  hideCompactActionsOnMobile?: boolean;
}) {
  const [hasToken, setHasToken] = useState(false);
  const { goldCoins, gpayCoins, gpayTokens, loading } = useCoins();

  useEffect(() => {
    getSessionAsync().then((s) => setHasToken(!!s?.accessToken));
  }, []);

  if (!hasToken) return null;

  if (compact) {
    return <div className="gp-balance-strip" role="group" aria-label="Wallet summary">
      <Link href="/dashboard/wallet" className="gp-balance-chip gp-balance-gold" aria-label="Gold Coins wallet"><span>GC</span><strong>{loading ? "—" : localeInt(goldCoins)}</strong></Link>
      <Link href="/dashboard/wallet#convert" className="gp-balance-chip gp-balance-violet" aria-label="GPay Coins wallet"><span>GPC</span><strong>{loading ? "—" : localeInt(gpayCoins)}</strong></Link>
      <Link href="/dashboard/redeem" className="gp-balance-chip" aria-label="$GPAY balance, redemption coming soon"><span>$GPAY</span><strong>{loading ? "—" : localeInt(gpayTokens)}</strong></Link>
    </div>;
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
          href="/dashboard/redeem"
          className="inline-flex min-w-[4.5rem] flex-1 justify-center rounded-lg border border-[#10B981]/50 bg-[#10B981]/15 px-2 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-[#10B981]/25"
        >
          Redeem
        </Link>
      </div>
    </div>
  );
}
