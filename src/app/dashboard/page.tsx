"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { getSessionAsync } from "@/lib/session";
import { localeInt, safeFiniteInt } from "@/lib/format-number";

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
  gpay_coins: number | null;
  gpay_tokens: number | null;
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
      gpay_coins,
      gpay_tokens,
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

  async function copyReferralCode() {
    const code = user?.referral_code?.trim() ?? "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div
        className={`flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-[#0e0118] px-4 py-16 text-violet-300/80 ${dmSans.className}`}
      >
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-400" />
        <p className="text-sm font-medium">Loading your dashboard…</p>
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

  if (!user) {
    return (
      <div
        className={`flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-[#0e0118] px-4 py-16 text-violet-300/80 ${dmSans.className}`}
      >
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500/20 border-t-amber-400" />
        <p className="text-sm font-medium">Preparing your balances…</p>
      </div>
    );
  }

  const firstName = user.full_name?.split(" ")[0] ?? "Member";
  const goldCoins = safeFiniteInt(user.gold_coins);
  const gpayCoins = safeFiniteInt(user.gpay_coins);
  const gpayTokens = safeFiniteInt(user.gpay_tokens);
  const tierRaw = user.membership_tier?.trim() ?? "";
  const tier = tierRaw ? formatTierLabel(tierRaw) : "Free";
  const referrals = safeFiniteInt(user.total_referrals);
  const referralCode = user.referral_code?.trim() ?? "";

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

      {/* Three-tier coin balances */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        <div
          className="w-full min-w-0 rounded-2xl p-4 shadow-lg tablet:p-5"
          style={{
            background: "linear-gradient(135deg, #1a0a00, #3d1a00)",
            border: "1px solid #F5C842",
          }}
        >
          <span className="text-3xl" aria-hidden>
            🪙
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/90">
            Gold Coins
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-white sm:text-3xl">
            {localeInt(goldCoins)} GC
          </p>
          <p className="mt-2 text-xs text-amber-100/70">Purchased with real money — convert to GPay Coins to play</p>
          <Link
            href="/dashboard/wallet"
            className="mt-3 inline-block text-sm font-medium text-amber-200/90 underline-offset-2 hover:underline"
          >
            Wallet →
          </Link>
        </div>

        <div
          className="w-full min-w-0 rounded-2xl p-4 shadow-lg tablet:p-5"
          style={{
            background: "linear-gradient(135deg, #0e0118, #1a0530)",
            border: "1px solid #A855F7",
          }}
        >
          <span className="text-3xl" aria-hidden>
            💜
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300/90">
            GPay Coins
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-white sm:text-3xl">
            {localeInt(gpayCoins)} GPC
          </p>
          <p className="mt-2 text-xs text-violet-200/75">Play games and earn prizes</p>
          <Link
            href="/dashboard/games"
            className="mt-3 inline-block text-sm font-medium text-violet-200/90 underline-offset-2 hover:underline"
          >
            Play games →
          </Link>
        </div>

        <div
          className="w-full min-w-0 rounded-2xl p-4 shadow-lg tablet:p-5"
          style={{
            background: "linear-gradient(135deg, #0a1f18, #0e2a22)",
            border: "1px solid #10B981",
          }}
        >
          <span className="text-3xl" aria-hidden>
            ⬡
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
            $GPAY Tokens
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-white sm:text-3xl">
            {localeInt(gpayTokens)} $GPAY
          </p>
          <p className="mt-2 text-xs text-emerald-200/75">Redeem GPC — trade on Raydium for USDC</p>
          <Link
            href="/dashboard/wallet#redeem"
            className="mt-3 inline-block text-sm font-medium text-emerald-200/90 underline-offset-2 hover:underline"
          >
            Redeem →
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/wallet"
          className="flex min-h-[48px] flex-1 min-w-[140px] items-center justify-center rounded-2xl px-4 py-3 text-center text-sm font-bold transition-opacity hover:opacity-95"
          style={{ background: "#F5C842", color: "#000" }}
        >
          Buy GC
        </Link>
        <Link
          href="/dashboard/wallet#convert"
          className="flex min-h-[48px] flex-1 min-w-[140px] items-center justify-center rounded-2xl border border-[#A855F7]/60 bg-[#A855F7]/20 px-4 py-3 text-center text-sm font-bold text-violet-100 hover:bg-[#A855F7]/30"
        >
          Convert
        </Link>
        <Link
          href="/dashboard/wallet#redeem"
          className="flex min-h-[48px] flex-1 min-w-[140px] items-center justify-center rounded-2xl border border-[#10B981]/60 bg-[#10B981]/20 px-4 py-3 text-center text-sm font-bold text-emerald-100 hover:bg-[#10B981]/30"
        >
          Redeem
        </Link>
      </div>

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
          You have <span className="font-bold text-[#F5C842]">{localeInt(referrals)}</span>{" "}
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
