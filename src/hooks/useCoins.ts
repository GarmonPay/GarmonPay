"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { formatGpcWithUsd } from "@/lib/gpay-coins-branding";

export function useCoins() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [gpayCoins, setGpayCoins] = useState(0);
  const [goldCoins, setGoldCoins] = useState(0);
  const [gpayTokens, setGpayTokens] = useState(0);
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
      setGpayCoins(0);
      setGoldCoins(0);
      setGpayTokens(0);
      setUsdBalance(0);
      setLoading(false);
      return;
    }
    const uid = session.user.id;

    const { data: userRow } = await supabase
      .from("users")
      .select("gpay_coins, gold_coins, gpay_tokens")
      .eq("id", uid)
      .maybeSingle();

    if (userRow) {
      const u = userRow as {
        gpay_coins?: number | null;
        gold_coins?: number | null;
        gpay_tokens?: number | null;
      };
      setGpayCoins(Math.max(0, Math.floor(Number(u.gpay_coins ?? 0))));
      setGoldCoins(Math.max(0, Math.floor(Number(u.gold_coins ?? 0))));
      setGpayTokens(Math.max(0, Math.floor(Number(u.gpay_tokens ?? 0))));
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

  const formatGPC = useCallback((amount: number) => formatGpcWithUsd(amount), []);

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
            const n = payload.new as {
              gpay_coins?: number;
              gold_coins?: number;
              gpay_tokens?: number;
            } | undefined;
            if (!n) return;
            if (typeof n.gpay_coins === "number") {
              setGpayCoins(Math.max(0, Math.floor(n.gpay_coins)));
            }
            if (typeof n.gold_coins === "number") {
              setGoldCoins(Math.max(0, Math.floor(n.gold_coins)));
            }
            if (typeof n.gpay_tokens === "number") {
              setGpayTokens(Math.max(0, Math.floor(n.gpay_tokens)));
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
    gpayCoins,
    goldCoins,
    gpayTokens,
    /** @deprecated use gpayCoins */
    sweepsCoins: gpayCoins,
    loading,
    refresh,
    formatGPC,
    formatUSD,
    usdBalance,
  };
}
