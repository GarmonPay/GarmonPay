"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";

const API_BASE = getApiRoot();

function AdminSettingsInner() {
  const session = useAdminSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adRewardPct, setAdRewardPct] = useState("40");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/platform-settings`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ad_reward_percent?: number;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.message ?? "Failed to load settings");
      }
      setAdRewardPct(String(Math.round(Number(data.ad_reward_percent ?? 40))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const pct = Number(adRewardPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError("Ad reward % must be between 0 and 100.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/admin/platform-settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ ad_reward_percent: pct }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Save failed");
      setSuccess("Saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="font-[family-name:var(--font-admin-display)] text-xl font-bold text-white mb-2">Settings</h1>
      <p className="mb-6 max-w-2xl text-sm text-white/60">
        Platform settings backed by <code className="text-[#f5c842]/90">platform_settings</code>. Daily payout caps and
        earn-rate toggles require additional columns — add via migration before surfacing here.
      </p>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : (
        <form onSubmit={save} className="max-w-md space-y-4 rounded-xl border border-white/10 bg-[#0e0118]/90 p-6">
          <div>
            <label className="mb-1 block text-sm text-white/70">Ad reward to users (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={adRewardPct}
              onChange={(e) => setAdRewardPct(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
            />
            <p className="mt-1 text-xs text-white/45">Percentage of ad revenue credited to users; platform keeps the rest.</p>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-emerald-400">{success}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d28d9] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <AdminPageGate>
      <AdminSettingsInner />
    </AdminPageGate>
  );
}
