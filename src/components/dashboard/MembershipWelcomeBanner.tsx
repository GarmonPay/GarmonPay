"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";

const DISMISS_PREFIX = "garmon_membership_welcome_dismiss_";

export function MembershipWelcomeBanner() {
  const [show, setShow] = useState<{ tier: string; gpc: number; id: string } | null>(null);

  useEffect(() => {
    const sb = createBrowserClient();
    if (!sb) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session?.user || cancelled) return;
      const uid = session.user.id;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: rows } = await sb
        .from("membership_bonuses")
        .select("id, to_tier, gpc_amount, credited_at")
        .eq("user_id", uid)
        .eq("bonus_type", "upgrade_bonus")
        .gte("credited_at", since)
        .order("credited_at", { ascending: false })
        .limit(1);
      const row = rows?.[0] as { id: string; to_tier: string; gpc_amount: number } | undefined;
      if (!row || cancelled) return;
      try {
        if (typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_PREFIX + row.id)) return;
      } catch {
        // ignore
      }
      setShow({ tier: row.to_tier, gpc: row.gpc_amount, id: row.id });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  const label = show.tier.charAt(0).toUpperCase() + show.tier.slice(1);

  function dismiss() {
    const row = show;
    if (!row) return;
    try {
      localStorage.setItem(DISMISS_PREFIX + row.id, new Date().toISOString());
    } catch {
      // ignore
    }
    setShow(null);
  }

  return (
    <div
      className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-900/60 via-yellow-900/40 to-amber-800/50 px-4 py-3 text-amber-50 shadow-lg sm:flex-row sm:items-center sm:justify-between"
      role="status"
    >
      <div>
        <p className="font-semibold text-amber-100">Welcome to {label}!</p>
        <p className="mt-1 text-sm text-amber-200/95">
          {show.gpc.toLocaleString()} GPay Coins (GPC) have been added to your account.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/dashboard/games"
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black hover:bg-amber-300"
        >
          PLAY NOW →
        </Link>
        <button type="button" onClick={dismiss} className="text-xs text-amber-200/90 underline">
          Dismiss
        </button>
      </div>
    </div>
  );
}
