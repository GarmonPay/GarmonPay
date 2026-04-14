"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { getSessionAsync } from "@/lib/session";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

type UserRow = {
  gold_coins: number | null;
  sweeps_coins: number | null;
  membership_tier: string | null;
  total_referrals: number | null;
  referral_code: string | null;
  full_name: string | null;
};

function tierIcon(tierRaw: string): string {
  const t = tierRaw.toLowerCase();
  if (t.includes("elite")) return "👑";
  if (t.includes("pro")) return "🥇";
  if (t.includes("growth")) return "🥈";
  if (t.includes("starter")) return "🥉";
  return "⭐";
}

function formatTierLabel(tierRaw: string): string {
  if (!tierRaw.trim()) return "Free";
  return tierRaw.charAt(0).toUpperCase() + tierRaw.slice(1).toLowerCase();
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadUser = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const session = await getSessionAsync();
    if (!session) {
      router.replace("/login?next=/dashboard");
      setLoading(false);
      return;
    }
    const supabase = createBrowserClient();
    if (!supabase) {
      setLoadError("Unable to connect");
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("users")
      .select(
        `
      gold_coins,
      sweeps_coins,
      membership_tier,
      total_referrals,
      referral_code,
      full_name
    `
      )
      .eq("id", session.userId)
      .single();

    if (error) {
      setLoadError(error.message);
      setUser(null);
    } else {
      setUser(data as UserRow);
      setLoadError(null);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) return;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const session = await getSessionAsync();
      if (!session?.userId || cancelled) return;
      ch = supabase
        .channel(`dashboard-users-${session.userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "users",
            filter: `id=eq.${session.userId}`,
          },
          (payload) => {
            const n = payload.new as Partial<UserRow>;
            setUser((prev) => (prev ? { ...prev, ...n } : prev));
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (ch && supabase) void supabase.removeChannel(ch);
    };
  }, []);

  const firstName = user?.full_name?.split(" ")[0] ?? "Member";
  const goldCoins = Math.max(0, Math.floor(Number(user?.gold_coins ?? 0)));
  const gpay = Math.max(0, Math.floor(Number(user?.sweeps_coins ?? 0)));
  const tierRaw = user?.membership_tier?.trim() ?? "";
  const tier = tierRaw ? formatTierLabel(tierRaw) : "Free";
  const referrals = Math.max(0, Math.floor(Number(user?.total_referrals ?? 0)));
  const referralCode = user?.referral_code?.trim() ?? "";

  async function copyReferralCode() {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div
        className={`flex min-h-[50vh] items-center justify-center bg-[#0e0118] text-violet-300/80 ${dmSans.className}`}
      >
        Loading…
      </div>
    );
  }

  if (loadError && !user) {
    return (
      <div className={`mx-auto max-w-md bg-[#0e0118] px-4 py-12 text-center ${dmSans.className}`}>
        <p className="text-red-400">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadUser();
          }}
          className="mt-4 rounded-xl bg-[#F5C842] px-5 py-2.5 text-sm font-semibold text-black"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={`min-h-full space-y-8 bg-[#0e0118] pb-4 pt-2 tablet:pb-8 ${dmSans.className}`}>
      <header>
        <h1
          className={`${cinzel.className} font-bold tracking-tight`}
          style={{
            color: "#F5C842",
            fontSize: "clamp(20px, 4vw, 32px)",
            lineHeight: 1.2,
          }}
        >
          Welcome back, {firstName}! 👑
        </h1>
      </header>

      {/* Coin balances */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        <div
          className="w-full min-w-0 rounded-2xl p-4 shadow-lg tablet:p-5"
          style={{
            background: "linear-gradient(135deg, #1a0a00, #3d1a00)",
            border: "1px solid #F5C842",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-3xl" aria-hidden>
              🪙
            </span>
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/90">
            GOLD COINS
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-white sm:text-3xl">
            {goldCoins.toLocaleString()} GC
          </p>
          <Link
            href="/dashboard/buy-coins"
            className="mt-4 inline-block text-sm font-medium text-amber-200/90 underline-offset-2 hover:underline"
          >
            Purchase more →
          </Link>
        </div>

        <div
          className="w-full min-w-0 rounded-2xl p-4 shadow-lg tablet:p-5"
          style={{
            background: "linear-gradient(135deg, #0e0118, #1a0530)",
            border: "1px solid #7C3AED",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-3xl" aria-hidden>
              ⚡
            </span>
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300/90">
            $GPAY
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-white sm:text-3xl">
            {gpay.toLocaleString()} $GPAY
          </p>
          <p className="mt-4 text-sm text-violet-200/75">Play games to earn more</p>
        </div>
      </div>

      <Link
        href="/dashboard/convert"
        className="flex min-h-[48px] w-full items-center justify-center rounded-2xl px-4 py-3 text-center text-base font-bold transition-opacity hover:opacity-95"
        style={{ background: "#F5C842", color: "#000" }}
      >
        Convert GC → $GPAY
      </Link>

      {/* Membership */}
      <div
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 tablet:p-6"
        style={{ borderColor: "rgba(124, 58, 237, 0.35)" }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {tierIcon(tierRaw || "free")}
          </span>
          <div>
            <p className="text-sm text-violet-200/80">Current Plan</p>
            <p className="text-lg font-semibold text-white">{tier}</p>
          </div>
        </div>
        <Link
          href="/dashboard/membership"
          className="mt-5 inline-flex items-center rounded-xl border border-[#7C3AED]/50 bg-[#7C3AED]/15 px-5 py-2.5 text-sm font-semibold text-violet-200 transition-colors hover:bg-[#7C3AED]/25"
        >
          Upgrade Plan →
        </Link>
      </div>

      {/* Quick actions */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-400/70">
          Quick actions
        </p>
        <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
          <Link
            href="/dashboard/games/celo"
            className="flex min-h-[48px] flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center text-sm font-medium text-white transition-colors hover:border-[#F5C842]/40 hover:bg-white/[0.07] tablet:px-4 tablet:py-4"
          >
            <span className="mb-1 block text-xl">🎲</span>
            Play C-Lo
          </Link>
          <Link
            href="/dashboard/earn"
            className="flex min-h-[48px] flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center text-sm font-medium text-white transition-colors hover:border-[#F5C842]/40 hover:bg-white/[0.07] tablet:px-4 tablet:py-4"
          >
            <span className="mb-1 block text-xl">📱</span>
            Watch Ads
          </Link>
          <Link
            href="/dashboard/referral"
            className="flex min-h-[48px] flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center text-sm font-medium text-white transition-colors hover:border-[#F5C842]/40 hover:bg-white/[0.07] tablet:px-4 tablet:py-4"
          >
            <span className="mb-1 block text-xl">👥</span>
            Refer Friends
          </Link>
          <Link
            href="/dashboard/merch"
            className="flex min-h-[48px] flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center text-sm font-medium text-white transition-colors hover:border-[#F5C842]/40 hover:bg-white/[0.07] tablet:px-4 tablet:py-4"
          >
            <span className="mb-1 block text-xl">🛍️</span>
            Merch Store
            <span className="mt-1 block text-[10px] font-normal text-violet-300/60">coming soon</span>
          </Link>
        </div>
      </div>

      {/* Referrals */}
      <div className="rounded-2xl border border-[#F5C842]/25 bg-black/30 p-4 tablet:p-6">
        <p className="text-base text-white">
          You have <span className="font-bold text-[#F5C842]">{referrals}</span>{" "}
          {referrals === 1 ? "referral" : "referrals"}
        </p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-violet-400/70">
          Your referral code
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="flex-1 rounded-xl border border-white/15 bg-black/40 px-4 py-3 font-mono text-lg text-[#F5C842]">
            {referralCode || "—"}
          </code>
          <button
            type="button"
            disabled={!referralCode}
            onClick={() => void copyReferralCode()}
            className="min-h-[48px] rounded-xl px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-40"
            style={{ background: "#7C3AED", color: "#fff" }}
          >
            {copied ? "Copied!" : "Copy code"}
          </button>
        </div>
      </div>
    </div>
  );
}
