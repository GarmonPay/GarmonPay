"use client";

import { useEffect, useState } from "react";
import { getAdminSession } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Tier = "starter" | "pro" | "elite" | "vip";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function tierLabel(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function AdminReferralsPage() {
  const session = getAdminSession();
  const [config, setConfig] = useState<Array<{ tier: string; percentage: number }>>([]);
  const [totalPaidCents, setTotalPaidCents] = useState(0);
  const [activeReferralSubs, setActiveReferralSubs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [editPct, setEditPct] = useState<Record<string, string>>({});

  function load() {
    if (!session) return;
    setLoading(true);
    fetch(`${API_BASE}/admin/referral-commissions`, { headers: { "X-Admin-Id": session.adminId } })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data) => {
        setConfig(data.config ?? []);
        setTotalPaidCents(data.totalRecurringCommissionsPaidCents ?? 0);
        setActiveReferralSubs(data.activeReferralSubscriptions ?? 0);
        const next: Record<string, string> = {};
        (data.config ?? []).forEach((c: { tier: string; percentage: number }) => {
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
        headers: { "Content-Type": "application/json", "X-Admin-Id": session.adminId },
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
        <p className="text-[#9ca3af]">Redirecting to admin login…</p>
      </div>
    );
  }
  if (loading && config.length === 0) {
    return (
      <div className="p-6">
        <p className="text-[#9ca3af]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Referrals & Recurring Commissions</h1>
      <p className="text-[#9ca3af] mb-6">
        One-time referral bonuses are in viral growth. Here: recurring commission config and stats for referred members with active paid subscriptions.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/20 text-green-400 text-sm">{success}</div>
      )}

      {/* Admin tracking */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
          <p className="text-[#9ca3af] text-sm">Total recurring commissions paid</p>
          <p className="text-2xl font-bold text-white">{formatCents(totalPaidCents)}</p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
          <p className="text-[#9ca3af] text-sm">Active referral subscriptions</p>
          <p className="text-2xl font-bold text-white">{activeReferralSubs}</p>
        </div>
      </div>

      {/* Commission % per tier */}
      <h2 className="text-lg font-bold text-white mb-3">Commission percentage per membership tier</h2>
      <p className="text-[#9ca3af] text-sm mb-4">
        When a referred user&apos;s subscription payment succeeds, the referrer gets this percentage of the monthly price. Stopped when subscription is canceled.
      </p>
      <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-3 text-sm font-medium text-[#9ca3af]">Tier</th>
              <th className="p-3 text-sm font-medium text-[#9ca3af]">Commission %</th>
              <th className="p-3 text-sm font-medium text-[#9ca3af]">Action</th>
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
                    <span className="ml-2 text-[#9ca3af] text-sm">%</span>
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
                      className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-500 disabled:opacity-50"
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
      <p className="mt-4 text-[#9ca3af] text-xs">
        Run the monthly process via <code className="bg-white/10 px-1 rounded">POST /api/cron/process-referral-commissions</code> with header <code className="bg-white/10 px-1 rounded">X-Cron-Secret</code> or <code className="bg-white/10 px-1 rounded">Authorization: Bearer &lt;CRON_SECRET&gt;</code>. Set <code className="bg-white/10 px-1 rounded">CRON_SECRET</code> in env.
      </p>
    </div>
  );
}
