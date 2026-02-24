"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import {
  getGamificationSummary,
  spinWheel,
  openMysteryBox,
  claimStreak,
  completeMission,
} from "@/lib/api";

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

export default function DashboardRewardsPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getGamificationSummary>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spinResult, setSpinResult] = useState<{ type: string; amount: number } | null>(null);
  const [mysteryResult, setMysteryResult] = useState<{ type: string; amount: number } | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [opening, setOpening] = useState(false);
  const [streakClaiming, setStreakClaiming] = useState(false);
  const [missionCompleting, setMissionCompleting] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/rewards");
        return;
      }
      setSession({ tokenOrId: s.accessToken ?? s.userId, isToken: !!s.accessToken });
      getGamificationSummary(s.accessToken ?? s.userId, !!s.accessToken)
        .then(setSummary)
        .catch(() => setError("Failed to load rewards"))
        .finally(() => setLoading(false));
    });
  }, [router]);

  const refresh = () => {
    if (!session) return;
    getGamificationSummary(session.tokenOrId, session.isToken).then(setSummary);
  };

  const handleSpin = () => {
    if (!session || spinning) return;
    setSpinning(true);
    setSpinResult(null);
    spinWheel(session.tokenOrId, session.isToken)
      .then((r) => {
        setSpinResult({ type: r.rewardType, amount: r.amountCents });
        refresh();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Spin failed"))
      .finally(() => setSpinning(false));
  };

  const handleOpenMystery = () => {
    if (!session || opening) return;
    setOpening(true);
    setMysteryResult(null);
    openMysteryBox(session.tokenOrId, session.isToken)
      .then((r) => {
        setMysteryResult({ type: r.rewardType, amount: r.amountCents });
        refresh();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Open failed"))
      .finally(() => setOpening(false));
  };

  const handleClaimStreak = () => {
    if (!session || streakClaiming) return;
    setStreakClaiming(true);
    claimStreak(session.tokenOrId, session.isToken)
      .then(() => refresh())
      .finally(() => setStreakClaiming(false));
  };

  const handleCompleteMission = (code: string) => {
    if (!session || missionCompleting) return;
    setMissionCompleting(code);
    completeMission(session.tokenOrId, session.isToken, code)
      .then(() => refresh())
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setMissionCompleting(null));
  };

  if (!session && !loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6" style={{ backgroundColor: "#111827" }}>
        <p style={{ color: "#9ca3af" }}>Redirecting to login…</p>
      </div>
    );
  }

  if (loading || !summary) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6" style={{ backgroundColor: "#111827" }}>
        <p style={{ color: "#9ca3af" }}>Loading rewards…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 tablet:space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white tablet:text-2xl">Rewards & Games</h1>
        <p className="text-sm text-fintech-muted mt-1">
          Spin the wheel, open mystery boxes, build your streak, and complete missions. All rewards are budget-controlled.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Rank */}
      {summary.rank && (
        <section className="animate-slide-up rounded-xl bg-gradient-to-br from-fintech-accent/20 to-fintech-money/10 border border-white/10 p-4 tablet:p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Your Rank</h2>
          <p className="text-2xl font-bold text-fintech-highlight">{summary.rank.name}</p>
          <p className="text-sm text-fintech-muted mt-1">
            Earnings multiplier: {summary.rank.earningsMultiplier}x
          </p>
        </section>
      )}

      {/* Spin wheel */}
      {summary.spinWheel?.enabled && (
        <section className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Daily Spin</h2>
          <p className="text-sm text-fintech-muted mb-4">
            Spins today: {summary.spinWheel.usedToday} / {summary.spinWheel.dailyLimit}
          </p>
          <button
            type="button"
            onClick={handleSpin}
            disabled={spinning || summary.spinWheel.usedToday >= summary.spinWheel.dailyLimit}
            className="min-h-touch w-full rounded-xl px-6 py-3 bg-fintech-accent text-white font-medium transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed tablet:w-auto"
          >
            {spinning ? "Spinning…" : "Spin"}
          </button>
          {spinResult && (
            <p className="mt-4 text-fintech-money font-medium">
              {spinResult.type === "none"
                ? "No reward this time"
                : `You won ${formatCents(spinResult.amount)} ${spinResult.type === "ad_credit" ? "ad credit" : "balance"}!`}
            </p>
          )}
        </section>
      )}

      {/* Mystery box */}
      {summary.mysteryBox?.enabled && (
        <section className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Mystery Box</h2>
          <p className="text-sm text-fintech-muted mb-4">Open for a random reward (balance or ad credit).</p>
          <button
            type="button"
            onClick={handleOpenMystery}
            disabled={opening}
            className="min-h-touch w-full rounded-xl px-6 py-3 bg-fintech-highlight/90 text-white font-medium transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 tablet:w-auto"
          >
            {opening ? "Opening…" : "Open Box"}
          </button>
          {mysteryResult && (
            <p className="mt-4 text-fintech-money font-medium">
              You got {formatCents(mysteryResult.amount)} {mysteryResult.type === "ad_credit" ? "ad credit" : "balance"}!
            </p>
          )}
        </section>
      )}

      {/* Streak */}
      <section className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Login Streak</h2>
        <p className="text-sm text-fintech-muted mb-2">
          Current streak: <strong className="text-white">{summary.streak.currentStreakDays}</strong> day
          {summary.streak.currentStreakDays !== 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={handleClaimStreak}
          disabled={streakClaiming}
          className="min-h-touch w-full rounded-xl px-6 py-3 bg-fintech-money/80 text-white font-medium transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-50 tablet:w-auto"
        >
          {streakClaiming ? "Claiming…" : "Claim streak reward"}
        </button>
      </section>

      {/* Missions */}
      <section className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Missions</h2>
        <ul className="space-y-3">
          {summary.missions.map((m) => (
            <li
              key={m.code}
              className="flex flex-col gap-3 rounded-lg bg-black/20 p-4 border border-white/10 tablet:flex-row tablet:items-center tablet:justify-between"
            >
              <div>
                <span className="font-medium text-white">{m.name}</span>
                <span className="text-fintech-muted text-sm ml-2">
                  {formatCents(m.rewardCents)} · {m.completedToday}/{m.dailyLimit} today
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCompleteMission(m.code)}
                disabled={missionCompleting !== null || m.completedToday >= m.dailyLimit}
                className="min-h-touch w-full rounded-xl px-4 py-3 bg-fintech-accent text-white text-sm font-medium transition-opacity disabled:opacity-50 active:scale-[0.98] tablet:w-auto tablet:py-2"
              >
                {missionCompleting === m.code ? "…" : m.completedToday >= m.dailyLimit ? "Done" : "Complete"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
