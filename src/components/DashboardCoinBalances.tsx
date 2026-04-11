"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import { scToUsdDisplay } from "@/lib/coins";

export function DashboardCoinBalances() {
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [usdCents, setUsdCents] = useState<number | null>(null);
  const [gc, setGc] = useState<number | null>(null);
  const [sc, setSc] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const r = await fetch("/api/coins/balance", { headers });
    if (!r.ok) return;
    const d = (await r.json()) as {
      balance_cents?: number;
      gold_coins?: number;
      sweeps_coins?: number;
    };
    setUsdCents(typeof d.balance_cents === "number" ? d.balance_cents : 0);
    setGc(typeof d.gold_coins === "number" ? d.gold_coins : 0);
    setSc(typeof d.sweeps_coins === "number" ? d.sweeps_coins : 0);
  }, [token]);

  useEffect(() => {
    getSessionAsync().then((s) => {
      setToken(s?.accessToken ?? null);
      setUserId(s?.userId ?? null);
    });
  }, []);

  useEffect(() => {
    if (!token || !userId) return;
    load();
  }, [token, userId, load]);

  useEffect(() => {
    if (!userId) return;
    const sb = createBrowserClient();
    if (!sb) return;
    const channel = sb
      .channel(`user-coins-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users", filter: `id=eq.${userId}` },
        () => {
          load();
        }
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [userId, load]);

  if (!token) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-100/95">
        <span aria-hidden>🪙</span>
        <span className="font-semibold tabular-nums">{gc != null ? gc.toLocaleString() : "—"}</span>
        <span className="text-amber-200/70">GC</span>
      </span>
      <span className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-violet-100/95">
        <span aria-hidden>⭐</span>
        <span className="font-semibold tabular-nums">{sc != null ? sc.toLocaleString() : "—"}</span>
        <span className="text-violet-200/70">SC</span>
        {sc != null && <span className="text-violet-300/60 hidden sm:inline">({scToUsdDisplay(sc)})</span>}
      </span>
      <Link
        href="/dashboard/wallet"
        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-100/95 hover:bg-emerald-500/15 transition-colors"
      >
        <span aria-hidden>💵</span>
        <span className="font-semibold tabular-nums">
          {usdCents != null ? `$${(usdCents / 100).toFixed(2)}` : "—"}
        </span>
        <span className="text-emerald-200/70">USD</span>
      </Link>
    </div>
  );
}
