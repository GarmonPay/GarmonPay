"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { formatGpcWithUsd } from "@/lib/gpay-coins-branding";

export function useCoins() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [gpayCoins, setGpayCoins] = useState(0);
  const [goldCoins, setGoldCoins] = useState(0);
  const [gpayTokens, setGpayTokens] = useState(0);
  const [loading, setLoading] = useState(true);

  /** Apply balance from a trusted API response (same field as DB: users.gpay_coins). */
  const applyServerGpayBalance = useCallback((gpc: number | null | undefined) => {
    if (gpc == null || !Number.isFinite(Number(gpc))) return;
    setGpayCoins(Math.max(0, Math.floor(Number(gpc))));
  }, []);

  const refresh = useCallback(async (): Promise<{
    gpayCoins: number;
    goldCoins: number;
    gpayTokens: number;
  } | null> => {
    if (!supabase) {
      setLoading(false);
      return null;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setGpayCoins(0);
      setGoldCoins(0);
      setGpayTokens(0);
      setLoading(false);
      return null;
    }
    const uid = session.user.id;

    const { data: userRow, error: rowErr } = await supabase
      .from("users")
      .select("gpay_coins, gold_coins, gpay_tokens")
      .eq("id", uid)
      .maybeSingle();

    if (rowErr) {
      console.warn("[useCoins] refresh users row failed", rowErr.message);
    }

    if (userRow) {
      const u = userRow as {
        gpay_coins?: number | null;
        gold_coins?: number | null;
        gpay_tokens?: number | null;
      };
      const g = Math.max(0, Math.floor(Number(u.gpay_coins ?? 0)));
      const gc = Math.max(0, Math.floor(Number(u.gold_coins ?? 0)));
      const gt = Math.max(0, Math.floor(Number(u.gpay_tokens ?? 0)));
      setGpayCoins(g);
      setGoldCoins(gc);
      setGpayTokens(gt);
      setLoading(false);
      return { gpayCoins: g, goldCoins: gc, gpayTokens: gt };
    }

    setLoading(false);
    return null;
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
              gpay_coins?: number | string;
              gold_coins?: number | string;
              gpay_tokens?: number | string;
            } | undefined;
            if (!n) return;
            // Realtime may omit unchanged columns; refetch full wallet row to avoid stale GPC.
            if (n.gpay_coins === undefined || n.gpay_coins === null) {
              void refresh();
              return;
            }
            const gNum = Number(n.gpay_coins);
            if (!Number.isFinite(gNum)) {
              void refresh();
              return;
            }
            setGpayCoins(Math.max(0, Math.floor(gNum)));
            if (n.gold_coins !== undefined && n.gold_coins !== null) {
              const x = Number(n.gold_coins);
              if (Number.isFinite(x)) setGoldCoins(Math.max(0, Math.floor(x)));
            }
            if (n.gpay_tokens !== undefined && n.gpay_tokens !== null) {
              const x = Number(n.gpay_tokens);
              if (Number.isFinite(x)) setGpayTokens(Math.max(0, Math.floor(x)));
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
    /** Set GPC from server settlement JSON (`users.gpay_coins` / `gpayCoins`). */
    applyServerGpayBalance,
    formatGPC,
    formatUSD,
  };
}
