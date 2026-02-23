"use client";

import { useEffect, useState } from "react";
import { getAdminSession } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Config = {
  globalBudget: {
    dailyBudgetCents: number;
    weeklyBudgetCents: number;
    dailyUsedCents: number;
    weeklyUsedCents: number;
  } | null;
  spinWheel: {
    enabled: boolean;
    dailySpinLimitPerUser: number;
    dailyTotalBudgetCents: number;
    rewardBalanceCents: number[];
    rewardAdCreditCents: number[];
    noRewardWeight: number;
  } | null;
  mysteryBox: {
    enabled: boolean;
    dailyTotalBudgetCents: number;
    rewardBalanceCents: number[];
    rewardAdCreditCents: number[];
  } | null;
  streak: {
    enabled: boolean;
    rewardPerDayCents: number;
    maxStreakRewardCents: number;
    dailyBudgetCents: number;
  } | null;
  missions: Array<{
    code: string;
    name: string;
    rewardCents: number;
    dailyLimitPerUser: number;
    dailyGlobalLimit: number | null;
    active: boolean;
  }>;
  ranks: Array<{
    code: string;
    name: string;
    sortOrder: number;
    minEarningsCents: number;
    minReferrals: number;
    earningsMultiplier: number;
  }>;
};

export default function AdminGamificationPage() {
  const session = getAdminSession();
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  function load() {
    if (!session) return;
    setLoading(true);
    fetch(`${API_BASE}/admin/gamification`, { headers: { "X-Admin-Id": session.adminId } })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then(setConfig)
      .catch(() => setError("Failed to load config"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.adminId]);

  async function save(updates: Record<string, unknown>) {
    if (!session) return;
    setSaving(true);
    setError(null);
    fetch(`${API_BASE}/admin/gamification`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Admin-Id": session.adminId },
      body: JSON.stringify(updates),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Save failed");
        setSuccess("Saved");
        setTimeout(() => setSuccess(null), 3000);
        load();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSaving(false));
  }

  if (!session) return null;
  if (loading || !config) {
    return (
      <div className="p-8">
        <p className="text-fintech-muted">Loading gamification config…</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-2">Gamification & Reward Budget</h1>
      <p className="text-sm text-fintech-muted mb-6">
        Control all reward amounts, limits, and budgets. Rewards stop automatically when budget is reached.
      </p>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-4 rounded-lg bg-green-500/20 text-green-400 text-sm">{success}</div>
      )}

      {/* Global budget */}
      <section className="mb-8 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Global Reward Budget (Phase 6)</h2>
        {config.globalBudget && (
          <div className="grid gap-4 sm:grid-cols-2 mb-4">
            <div>
              <label className="block text-sm text-fintech-muted mb-1">Daily budget (cents)</label>
              <input
                type="number"
                defaultValue={config.globalBudget.dailyBudgetCents}
                id="gb-daily"
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-fintech-muted mb-1">Weekly budget (cents)</label>
              <input
                type="number"
                defaultValue={config.globalBudget.weeklyBudgetCents}
                id="gb-weekly"
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
              />
            </div>
          </div>
        )}
        <p className="text-xs text-fintech-muted mb-2">
          Used today: {config.globalBudget?.dailyUsedCents ?? 0} / Used this week:{" "}
          {config.globalBudget?.weeklyUsedCents ?? 0}
        </p>
        <button
          type="button"
          onClick={() => {
            const daily = parseInt((document.getElementById("gb-daily") as HTMLInputElement)?.value, 10);
            const weekly = parseInt((document.getElementById("gb-weekly") as HTMLInputElement)?.value, 10);
            if (!Number.isFinite(daily) || !Number.isFinite(weekly)) return;
            save({ globalBudget: { dailyBudgetCents: daily, weeklyBudgetCents: weekly } });
          }}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-fintech-accent text-white text-sm font-medium disabled:opacity-50"
        >
          Save global budget
        </button>
      </section>

      {/* Spin wheel */}
      <section className="mb-8 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Spin Wheel</h2>
        {config.spinWheel && (
          <>
            <label className="flex items-center gap-2 text-sm text-fintech-muted mb-2">
              <input
                type="checkbox"
                defaultChecked={config.spinWheel.enabled}
                id="sw-enabled"
              />
              Enabled
            </label>
            <div className="grid gap-4 sm:grid-cols-2 mb-2">
              <div>
                <label className="block text-sm text-fintech-muted mb-1">Daily spins per user</label>
                <input
                  type="number"
                  defaultValue={config.spinWheel.dailySpinLimitPerUser}
                  id="sw-limit"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-fintech-muted mb-1">Daily total budget (cents)</label>
                <input
                  type="number"
                  defaultValue={config.spinWheel.dailyTotalBudgetCents}
                  id="sw-budget"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                save({
                  spinWheel: {
                    enabled: (document.getElementById("sw-enabled") as HTMLInputElement)?.checked,
                    dailySpinLimitPerUser: parseInt((document.getElementById("sw-limit") as HTMLInputElement)?.value ?? "1", 10),
                    dailyTotalBudgetCents: parseInt((document.getElementById("sw-budget") as HTMLInputElement)?.value ?? "5000", 10),
                    rewardBalanceCents: config.spinWheel!.rewardBalanceCents,
                    rewardAdCreditCents: config.spinWheel!.rewardAdCreditCents,
                    noRewardWeight: config.spinWheel!.noRewardWeight,
                  },
                });
              }}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-fintech-accent text-white text-sm font-medium disabled:opacity-50"
            >
              Save spin wheel
            </button>
          </>
        )}
      </section>

      {/* Mystery box */}
      <section className="mb-8 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Mystery Box</h2>
        {config.mysteryBox && (
          <>
            <label className="flex items-center gap-2 text-sm text-fintech-muted mb-2">
              <input type="checkbox" defaultChecked={config.mysteryBox.enabled} id="mb-enabled" />
              Enabled
            </label>
            <div className="mb-2">
              <label className="block text-sm text-fintech-muted mb-1">Daily total budget (cents)</label>
              <input
                type="number"
                defaultValue={config.mysteryBox.dailyTotalBudgetCents}
                id="mb-budget"
                className="w-full max-w-xs px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                save({
                  mysteryBox: {
                    enabled: (document.getElementById("mb-enabled") as HTMLInputElement)?.checked,
                    dailyTotalBudgetCents: parseInt((document.getElementById("mb-budget") as HTMLInputElement)?.value ?? "3000", 10),
                    rewardBalanceCents: config.mysteryBox!.rewardBalanceCents,
                    rewardAdCreditCents: config.mysteryBox!.rewardAdCreditCents,
                  },
                });
              }}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-fintech-accent text-white text-sm font-medium disabled:opacity-50"
            >
              Save mystery box
            </button>
          </>
        )}
      </section>

      {/* Streak */}
      <section className="mb-8 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Login Streak</h2>
        {config.streak && (
          <>
            <label className="flex items-center gap-2 text-sm text-fintech-muted mb-2">
              <input type="checkbox" defaultChecked={config.streak.enabled} id="st-enabled" />
              Enabled
            </label>
            <div className="grid gap-4 sm:grid-cols-3 mb-2">
              <div>
                <label className="block text-sm text-fintech-muted mb-1">Reward per day (cents)</label>
                <input
                  type="number"
                  defaultValue={config.streak.rewardPerDayCents}
                  id="st-perday"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-fintech-muted mb-1">Max streak reward (cents)</label>
                <input
                  type="number"
                  defaultValue={config.streak.maxStreakRewardCents}
                  id="st-max"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-fintech-muted mb-1">Daily budget (cents)</label>
                <input
                  type="number"
                  defaultValue={config.streak.dailyBudgetCents}
                  id="st-budget"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                save({
                  streak: {
                    enabled: (document.getElementById("st-enabled") as HTMLInputElement)?.checked,
                    rewardPerDayCents: parseInt((document.getElementById("st-perday") as HTMLInputElement)?.value ?? "5", 10),
                    maxStreakRewardCents: parseInt((document.getElementById("st-max") as HTMLInputElement)?.value ?? "100", 10),
                    dailyBudgetCents: parseInt((document.getElementById("st-budget") as HTMLInputElement)?.value ?? "2000", 10),
                  },
                });
              }}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-fintech-accent text-white text-sm font-medium disabled:opacity-50"
            >
              Save streak
            </button>
          </>
        )}
      </section>

      {/* Missions */}
      <section className="mb-8 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Missions</h2>
        <p className="text-sm text-fintech-muted mb-4">
          Edit reward and daily limits per mission. Codes: watch_ad, refer_user, login_daily.
        </p>
        <ul className="space-y-2">
          {config.missions.map((m) => (
            <li key={m.code} className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-black/20">
              <span className="font-medium text-white">{m.name}</span>
              <span className="text-fintech-muted text-sm">({m.code})</span>
              <input
                type="number"
                placeholder="Reward cents"
                defaultValue={m.rewardCents}
                id={`m-${m.code}-reward`}
                className="w-24 px-2 py-1 rounded bg-black/30 border border-white/10 text-white text-sm"
              />
              <input
                type="number"
                placeholder="Daily limit"
                defaultValue={m.dailyLimitPerUser}
                id={`m-${m.code}-limit`}
                className="w-20 px-2 py-1 rounded bg-black/30 border border-white/10 text-white text-sm"
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            save({
              missions: config.missions.map((m) => ({
                code: m.code,
                rewardCents: parseInt(
                  (document.getElementById(`m-${m.code}-reward`) as HTMLInputElement)?.value ?? "0",
                  10
                ),
                dailyLimitPerUser: parseInt(
                  (document.getElementById(`m-${m.code}-limit`) as HTMLInputElement)?.value ?? "1",
                  10
                ),
              })),
            });
          }}
          disabled={saving}
          className="mt-4 px-4 py-2 rounded-lg bg-fintech-accent text-white text-sm font-medium disabled:opacity-50"
        >
          Save missions
        </button>
      </section>

      {/* Ranks */}
      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Ranks (requirements)</h2>
        <p className="text-sm text-fintech-muted mb-4">
          Starter, Pro, Elite, VIP, Legend. Admin controls min earnings and min referrals.
        </p>
        <ul className="space-y-2">
          {config.ranks.map((r) => (
            <li key={r.code} className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-black/20">
              <span className="font-medium text-white">{r.name}</span>
              <input
                type="number"
                placeholder="Min earnings cents"
                defaultValue={r.minEarningsCents}
                id={`r-${r.code}-earn`}
                className="w-28 px-2 py-1 rounded bg-black/30 border border-white/10 text-white text-sm"
              />
              <input
                type="number"
                placeholder="Min referrals"
                defaultValue={r.minReferrals}
                id={`r-${r.code}-ref`}
                className="w-20 px-2 py-1 rounded bg-black/30 border border-white/10 text-white text-sm"
              />
              <input
                type="number"
                step="0.1"
                placeholder="Multiplier"
                defaultValue={r.earningsMultiplier}
                id={`r-${r.code}-mul`}
                className="w-20 px-2 py-1 rounded bg-black/30 border border-white/10 text-white text-sm"
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            save({
              ranks: config.ranks.map((r) => ({
                code: r.code,
                minEarningsCents: parseInt(
                  (document.getElementById(`r-${r.code}-earn`) as HTMLInputElement)?.value ?? "0",
                  10
                ),
                minReferrals: parseInt(
                  (document.getElementById(`r-${r.code}-ref`) as HTMLInputElement)?.value ?? "0",
                  10
                ),
                earningsMultiplier: parseFloat(
                  (document.getElementById(`r-${r.code}-mul`) as HTMLInputElement)?.value ?? "1"
                ),
              })),
            });
          }}
          disabled={saving}
          className="mt-4 px-4 py-2 rounded-lg bg-fintech-accent text-white text-sm font-medium disabled:opacity-50"
        >
          Save ranks
        </button>
      </section>
    </div>
  );
}
