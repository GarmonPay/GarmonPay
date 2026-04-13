"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { scToUsdDisplay } from "@/lib/coins";

export function useCoins() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [sweepsCoins, setSweepsCoins] = useState(0);
  const [goldCoins, setGoldCoins] = useState(0);
  /** USD wallet balance in cents (from `wallet_balances.balance`). */
  const [usdBalance, setUsdBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setSweepsCoins(0);
      setGoldCoins(0);
      setUsdBalance(0);
      setLoading(false);
      return;
    }
    const uid = session.user.id;

    const { data: userRow } = await supabase
      .from("users")
      .select("sweeps_coins, gold_coins")
      .eq("id", uid)
      .maybeSingle();

    if (userRow) {
      const u = userRow as { sweeps_coins?: number | null; gold_coins?: number | null };
      setSweepsCoins(Math.max(0, Math.floor(Number(u.sweeps_coins ?? 0))));
      setGoldCoins(Math.max(0, Math.floor(Number(u.gold_coins ?? 0))));
    }

    const { data: wallet } = await supabase
      .from("wallet_balances")
      .select("balance")
      .eq("user_id", uid)
      .maybeSingle();

    if (wallet) {
      const w = wallet as { balance?: number | null };
      setUsdBalance(Math.max(0, Math.floor(Number(w.balance ?? 0))));
    } else {
      setUsdBalance(0);
    }

    setLoading(false);
  }, [supabase]);

  const formatSC = useCallback((amount: number) => {
    const n = Math.max(0, Math.floor(Number(amount)));
    return `${n.toLocaleString()} SC (${scToUsdDisplay(n)})`;
  }, []);

  const formatUSD = useCallback((cents: number) => `$${(Math.max(0, cents) / 100).toFixed(2)}`, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

    async function setup() {
      await refresh();
      if (cancelled || !supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      const uid = session.user.id;

      channel = supabase
        .channel(`user-coins-hook-${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "users", filter: `id=eq.${uid}` },
          (payload) => {
            const n = payload.new as { sweeps_coins?: number; gold_coins?: number } | undefined;
            if (!n) return;
            if (typeof n.sweeps_coins === "number") {
              setSweepsCoins(Math.max(0, Math.floor(n.sweeps_coins)));
            }
            if (typeof n.gold_coins === "number") {
              setGoldCoins(Math.max(0, Math.floor(n.gold_coins)));
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "wallet_balances",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            const n = payload.new as { balance?: number } | undefined;
            if (n && typeof n.balance === "number") {
              setUsdBalance(Math.max(0, Math.floor(n.balance)));
            }
          }
        )
        .subscribe();
    }

    void setup();

    return () => {
      cancelled = true;
      if (channel && supabase) {
        void supabase.removeChannel(channel);
      }
    };
  }, [supabase, refresh]);

  return {
    sweepsCoins,
    goldCoins,
    usdBalance,
    loading,
    refresh,
    formatSC,
    formatUSD,
  };
}
