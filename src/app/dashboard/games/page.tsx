"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import {
  getGamesBudget,
  gamesSpin,
  gamesScratch,
  gamesDailyBonus,
  gamesMysteryBox,
} from "@/lib/api";

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

export default function DashboardGamesPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState<{ remaining: number; noRewardsRemaining: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ game: string; amountCents: number } | null>(null);

  const [spinning, setSpinning] = useState(false);
  const [scratching, setScratching] = useState(false);
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [openingMystery, setOpeningMystery] = useState(false);
  const [liveFightsCount, setLiveFightsCount] = useState<number>(0);

  useEffect(() => {
    fetch("/api/boxing/live-matches")
      .then((r) => r.ok ? r.json() : { matches: [] })
      .then((d) => setLiveFightsCount(Array.isArray(d?.matches) ? d.matches.length : 0))
      .catch(() => {});
  }, []);

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

  const handleSpin = () => {
    if (!session || spinning) return;
    setError(null);
    setResult(null);
    setSpinning(true);
    gamesSpin(session.tokenOrId, session.isToken)
      .then((r) => {
        setResult({ game: "Spin Wheel", amountCents: r.amountCents });
        refreshBudget();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Spin failed"))
      .finally(() => setSpinning(false));
  };

  const handleScratch = () => {
    if (!session || scratching) return;
    setError(null);
    setResult(null);
    setScratching(true);
    gamesScratch(session.tokenOrId, session.isToken)
      .then((r) => {
        setResult({ game: "Scratch Card", amountCents: r.amountCents });
        refreshBudget();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Scratch failed"))
      .finally(() => setScratching(false));
  };

  const handleDailyBonus = () => {
    if (!session || claimingDaily) return;
    setError(null);
    setResult(null);
    setClaimingDaily(true);
    gamesDailyBonus(session.tokenOrId, session.isToken)
      .then((r) => {
        setResult({ game: "Daily Bonus", amountCents: r.amountCents });
        refreshBudget();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Claim failed"))
      .finally(() => setClaimingDaily(false));
  };

  const handleMysteryBox = () => {
    if (!session || openingMystery) return;
    setError(null);
    setResult(null);
    setOpeningMystery(true);
    gamesMysteryBox(session.tokenOrId, session.isToken)
      .then((r) => {
        setResult({ game: "Mystery Box", amountCents: r.amountCents });
        refreshBudget();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Open failed"))
      .finally(() => setOpeningMystery(false));
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
        </p>
        <Link href="/dashboard/games/boxing" className="inline-block mt-2 text-fintech-accent hover:underline">
          🥊 Boxing Arena
        </Link>
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
          <p className="text-green-200 font-medium">{result.game}: You won {formatCents(result.amountCents)}!</p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Spin Wheel */}
        <div className={cardBase}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl" style={{ filter: "drop-shadow(0 0 8px rgba(212,175,55,0.3))" }}>🎡</span>
            <h2 className="text-lg font-semibold text-white">Spin Wheel</h2>
          </div>
          <p className="text-sm text-fintech-muted mb-4">Spin for a chance to win $0.00 to $0.10. Budget protected.</p>
          <button
            type="button"
            onClick={handleSpin}
            disabled={noRewards || spinning}
            className="w-full py-3 rounded-lg bg-fintech-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {spinning ? (
              <span className="inline-block animate-spin">🎡</span>
            ) : (
              "Spin"
            )}
          </button>
        </div>

        {/* Scratch Card */}
        <div className={cardBase}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🎫</span>
            <h2 className="text-lg font-semibold text-white">Scratch Card</h2>
          </div>
          <p className="text-sm text-fintech-muted mb-4">Reveal a random reward. Same odds as the wheel.</p>
          <button
            type="button"
            onClick={handleScratch}
            disabled={noRewards || scratching}
            className="w-full py-3 rounded-lg border-2 border-fintech-highlight text-fintech-highlight font-semibold hover:bg-fintech-highlight/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {scratching ? "Revealing…" : "Scratch"}
          </button>
        </div>

        {/* Mystery Box */}
        <div className={cardBase}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">📦</span>
            <h2 className="text-lg font-semibold text-white">Mystery Box</h2>
          </div>
          <p className="text-sm text-fintech-muted mb-4">Open for a random reward — or nothing. 50/50.</p>
          <button
            type="button"
            onClick={handleMysteryBox}
            disabled={noRewards || openingMystery}
            className="w-full py-3 rounded-lg bg-fintech-money/80 text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {openingMystery ? "Opening…" : "Open Box"}
          </button>
        </div>

        {/* Daily Bonus */}
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

        {/* Boxing Arena — real-time PvP */}
        <Link href="/dashboard/games/boxing" className={`game-card ${cardBase} block no-underline text-inherit`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🥊</span>
            <h2 className="text-lg font-semibold text-white">Boxing Arena</h2>
          </div>
          <p className="text-sm text-fintech-muted mb-1">Fight other players. Winner takes the prize.</p>
          {liveFightsCount > 0 && (
            <p className="text-sm text-green-400 mb-3">Live fights happening now</p>
          )}
          <span className="inline-block w-full py-3 rounded-lg bg-fintech-accent text-white font-semibold text-center hover:opacity-90 transition-all">
            Enter Arena
          </span>
        </Link>

        {/* Leaderboard — link only */}
        <Link href="/dashboard/leaderboard" className={`${cardBase} block no-underline text-inherit`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🏆</span>
            <h2 className="text-lg font-semibold text-white">Leaderboard</h2>
          </div>
          <p className="text-sm text-fintech-muted mb-4">See how you rank by referrals and activity.</p>
          <span className="inline-block py-3 px-4 rounded-lg bg-white/5 text-fintech-accent font-medium">View Leaderboard →</span>
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
