"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getGamesBudget, gamesDailyBonus } from "@/lib/api";
import { scToUsdDisplay } from "@/lib/coins";

export default function DashboardGamesPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState<{ remaining: number; noRewardsRemaining: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ game: string; amountSc: number } | null>(null);

  const [claimingDaily, setClaimingDaily] = useState(false);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/games");
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      setSession({ tokenOrId, isToken });
      getGamesBudget(tokenOrId, isToken)
        .then((b) => setBudget({ remaining: b.remaining, noRewardsRemaining: b.noRewardsRemaining }))
        .catch(() => setBudget({ remaining: 0, noRewardsRemaining: true }))
        .finally(() => setLoading(false));
    });
  }, [router]);

  const refreshBudget = () => {
    if (!session) return;
    getGamesBudget(session.tokenOrId, session.isToken)
      .then((b) => setBudget({ remaining: b.remaining, noRewardsRemaining: b.noRewardsRemaining }))
      .catch(() => {});
  };

  const handleDailyBonus = () => {
    if (!session || claimingDaily) return;
    setError(null);
    setResult(null);
    setClaimingDaily(true);
    gamesDailyBonus(session.tokenOrId, session.isToken)
      .then((r) => {
        setResult({ game: "Daily Bonus", amountSc: r.amountSc });
        refreshBudget();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Claim failed"))
      .finally(() => setClaimingDaily(false));
  };

  if (loading || !session) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 flex items-center justify-center min-h-[280px]">
        <p className="text-fintech-muted">Loading games…</p>
      </div>
    );
  }

  const noRewards = budget?.noRewardsRemaining ?? false;
  const cardBase = "rounded-xl bg-fintech-bg-card border border-white/10 p-6 transition-all duration-300 hover:border-fintech-accent/40 hover:shadow-lg hover:shadow-fintech-accent/5";

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Games</h1>
        <p className="text-sm text-fintech-muted mt-1">
          Rewards are drawn from the platform budget. Play fair — all calculations are server-side.
          <Link href="/games" className="ml-2 text-fintech-accent hover:underline">Neon Game Station →</Link>
        </p>
      </div>

      {noRewards && (
        <div className="rounded-xl bg-amber-500/15 border border-amber-500/40 p-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <p className="text-amber-200 font-medium">No rewards remaining today.</p>
          <p className="text-amber-200/80 text-sm">Daily budget has been reached. Try again tomorrow.</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-4 flex items-center justify-between gap-4">
          <p className="text-red-200">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-red-300 hover:text-white text-sm underline">Dismiss</button>
        </div>
      )}

      {result && (
        <div className="rounded-xl bg-green-500/15 border border-green-500/40 p-4 animate-in fade-in duration-300">
          <p className="text-green-200 font-medium">
            {result.game}: You won {result.amountSc.toLocaleString()} SC ({scToUsdDisplay(result.amountSc)})!
          </p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/dashboard/games/spin" className={`${cardBase} block no-underline text-inherit`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl" style={{ filter: "drop-shadow(0 0 8px rgba(212,175,55,0.3))" }}>🎡</span>
            <h2 className="text-lg font-semibold text-white">Spin Wheel</h2>
          </div>
          <p className="text-sm text-fintech-muted mb-4">Spin for a chance to win rewards — opening soon.</p>
          <span className="inline-block py-3 px-4 rounded-lg bg-white/5 text-fintech-accent font-medium">View →</span>
        </Link>

        <Link href="/dashboard/games/scratch" className={`${cardBase} block no-underline text-inherit`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🎫</span>
            <h2 className="text-lg font-semibold text-white">Scratch Card</h2>
          </div>
          <p className="text-sm text-fintech-muted mb-4">Reveal instant rewards — opening soon.</p>
          <span className="inline-block py-3 px-4 rounded-lg bg-white/5 text-fintech-accent font-medium">View →</span>
        </Link>

        <Link href="/dashboard/games/mystery-box" className={`${cardBase} block no-underline text-inherit`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">📦</span>
            <h2 className="text-lg font-semibold text-white">Mystery Box</h2>
          </div>
          <p className="text-sm text-fintech-muted mb-4">Random rewards — opening soon.</p>
          <span className="inline-block py-3 px-4 rounded-lg bg-white/5 text-fintech-accent font-medium">View →</span>
        </Link>

        <div className={cardBase}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🎁</span>
            <h2 className="text-lg font-semibold text-white">Daily Bonus</h2>
          </div>
          <p className="text-sm text-fintech-muted mb-4">Claim once every 24 hours. Small guaranteed reward.</p>
          <button
            type="button"
            onClick={handleDailyBonus}
            disabled={noRewards || claimingDaily}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-fintech-accent to-fintech-highlight text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {claimingDaily ? "Claiming…" : "Claim Daily Bonus"}
          </button>
        </div>

        <Link href="/dashboard/leaderboard" className={`${cardBase} block no-underline text-inherit`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🏆</span>
            <h2 className="text-lg font-semibold text-white">Leaderboard</h2>
          </div>
          <p className="text-sm text-fintech-muted mb-4">See how you rank by referrals and activity.</p>
          <span className="inline-block py-3 px-4 rounded-lg bg-white/5 text-fintech-accent font-medium">View Leaderboard →</span>
        </Link>

        <Link href="/dashboard/games/pinball" className={`${cardBase} block no-underline text-inherit`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl" style={{ filter: "drop-shadow(0 0 8px rgba(0,240,255,0.5))" }}>🎮</span>
            <h2 className="text-lg font-semibold text-white">GarmonPay Pinball</h2>
          </div>
          <p className="text-sm text-fintech-muted mb-4">Neon pinball and leaderboards — opening soon.</p>
          <span className="inline-block py-3 px-4 rounded-lg bg-[#00f0ff]/10 text-[#00f0ff] font-medium border border-[#00f0ff]/30">View →</span>
        </Link>
      </div>

      <div className="rounded-xl bg-black/20 border border-white/10 p-6">
        <h3 className="text-sm font-semibold text-fintech-muted uppercase tracking-wider mb-2">How it works</h3>
        <p className="text-sm text-fintech-muted">
          All rewards are deducted from the platform reward budget — not from unlimited balance. This keeps the system sustainable.
          Duplicate claims and refresh abuse are prevented server-side.
        </p>
      </div>
    </div>
  );
}
