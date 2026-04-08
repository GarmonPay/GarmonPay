"use client";

import { useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = getApiRoot();

type Tier = "starter" | "pro" | "elite" | "vip";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function tierLabel(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function AdminReferralsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [config, setConfig] = useState<Array<{ tier: string; percentage: number }>>([]);
  const [totalPaidCents, setTotalPaidCents] = useState(0);
  const [activeReferralSubs, setActiveReferralSubs] = useState(0);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [totalCommissionsPaidCents, setTotalCommissionsPaidCents] = useState(0);
  const [activeReferrals, setActiveReferrals] = useState(0);
  const [leaderboard, setLeaderboard] = useState<Array<{ rank: number; userId: string; email: string; totalReferrals: number; totalEarningsCents: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [editPct, setEditPct] = useState<Record<string, string>>({});

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  function load() {
    if (!session) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${API_BASE}/admin/referral-commissions`, { credentials: "include", headers: adminApiHeaders(session) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed")))),
      fetch(`${API_BASE}/admin/referrals-stats`, { credentials: "include", headers: adminApiHeaders(session) }).then((r) => (r.ok ? r.json() : { totalReferrals: 0, totalCommissionsPaidCents: 0, activeReferrals: 0, leaderboard: [] })),
    ])
      .then(([commData, statsData]) => {
        setConfig(commData.config ?? []);
        setTotalPaidCents(commData.totalRecurringCommissionsPaidCents ?? 0);
        setActiveReferralSubs(commData.activeReferralSubscriptions ?? 0);
        setTotalReferrals(statsData.totalReferrals ?? 0);
        setTotalCommissionsPaidCents(statsData.totalCommissionsPaidCents ?? 0);
        setActiveReferrals(statsData.activeReferrals ?? 0);
        setLeaderboard(statsData.leaderboard ?? []);
        const next: Record<string, string> = {};
        (commData.config ?? []).forEach((c: { tier: string; percentage: number }) => {
          next[c.tier] = String(c.percentage);
        });
        setEditPct(next);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.adminId]);

  async function saveTier(tier: Tier, percentage: number) {
    if (!session) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/admin/referral-commissions`, {
        method: "PATCH",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ tier, percentage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.message as string) || "Update failed");
        return;
      }
      setSuccess(`${tierLabel(tier)} set to ${percentage}%`);
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch {
      setError("Request failed");
    } finally {
      setSaving(false);
    }
  }

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <p className="text-fintech-muted">Redirecting to admin login…</p>
      </div>
    );
  }
  if (loading && config.length === 0) {
    return (
      <div className="p-6">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-2">Referrals & Recurring Commissions</h1>
      <p className="text-fintech-muted mb-6">
        One-time referral bonuses are in viral growth. Here: recurring commission config and stats for referred members with active paid subscriptions.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/20 text-green-400 text-sm">{success}</div>
      )}

      {/* Admin tracking */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-4">
          <p className="text-fintech-muted text-sm">Total referrals</p>
          <p className="text-2xl font-bold text-white">{totalReferrals}</p>
        </div>
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-4">
          <p className="text-fintech-muted text-sm">Total commissions paid</p>
          <p className="text-2xl font-bold text-white">{formatCents(totalCommissionsPaidCents)}</p>
        </div>
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-4">
          <p className="text-fintech-muted text-sm">Active referrals</p>
          <p className="text-2xl font-bold text-white">{activeReferrals}</p>
        </div>
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-4">
          <p className="text-fintech-muted text-sm">Recurring commissions paid</p>
          <p className="text-2xl font-bold text-white">{formatCents(totalPaidCents)}</p>
        </div>
      </div>

      {/* Top referrers leaderboard */}
      <h2 className="text-lg font-bold text-white mb-3">Top referrers leaderboard</h2>
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden mb-8">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-3 text-sm font-medium text-fintech-muted">Rank</th>
              <th className="p-3 text-sm font-medium text-fintech-muted">User</th>
              <th className="p-3 text-sm font-medium text-fintech-muted">Total referrals</th>
              <th className="p-3 text-sm font-medium text-fintech-muted">Total earnings</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row) => (
              <tr key={row.userId} className="border-b border-white/5">
                <td className="p-3 text-white font-medium">{row.rank}</td>
                <td className="p-3 text-white font-mono text-sm">{row.email}</td>
                <td className="p-3 text-white">{row.totalReferrals}</td>
                <td className="p-3 text-emerald-400">{formatCents(row.totalEarningsCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {leaderboard.length === 0 && (
          <p className="p-4 text-fintech-muted text-sm">No referrers yet.</p>
        )}
      </div>

      {/* Commission % per tier */}
      <h2 className="text-lg font-bold text-white mb-3">Commission percentage per membership tier</h2>
      <p className="text-fintech-muted text-sm mb-4">
        When a referred user&apos;s subscription payment succeeds, the referrer gets this percentage of the monthly price. Stopped when subscription is canceled.
      </p>
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-3 text-sm font-medium text-fintech-muted">Tier</th>
              <th className="p-3 text-sm font-medium text-fintech-muted">Commission %</th>
              <th className="p-3 text-sm font-medium text-fintech-muted">Action</th>
            </tr>
          </thead>
          <tbody>
            {(["starter", "pro", "elite", "vip"] as Tier[]).map((tier) => {
              const row = config.find((c) => c.tier === tier);
              const pct = row?.percentage ?? 0;
              const value = editPct[tier] ?? String(pct);
              return (
                <tr key={tier} className="border-b border-white/5">
                  <td className="p-3 text-white font-medium">{tierLabel(tier)}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={value}
                      onChange={(e) => setEditPct((prev) => ({ ...prev, [tier]: e.target.value }))}
                      className="w-24 px-2 py-1 rounded bg-black/30 border border-white/20 text-white text-sm"
                    />
                    <span className="ml-2 text-fintech-muted text-sm">%</span>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        const num = parseFloat(value);
                        if (Number.isFinite(num) && num >= 0 && num <= 100) {
                          saveTier(tier, num);
                        } else {
                          setError("Enter a number between 0 and 100");
                        }
                      }}
                      className="px-3 py-1 rounded-xl bg-fintech-accent text-white text-sm hover:bg-fintech-accent/90 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-fintech-muted text-xs">
        Run the monthly process via <code className="bg-white/10 px-1 rounded">POST /api/cron/process-referral-commissions</code> with header <code className="bg-white/10 px-1 rounded">X-Cron-Secret</code> or <code className="bg-white/10 px-1 rounded">Authorization: Bearer &lt;CRON_SECRET&gt;</code>. Set <code className="bg-white/10 px-1 rounded">CRON_SECRET</code> in env.
      </p>
    </div>
  );
}
