"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import { ActionButton } from "@/components/admin/ActionButton";

const API_BASE = getApiRoot();

function AdminConfigInner() {
  const session = useAdminSession();
  const [watchPayoutGpc, setWatchPayoutGpc] = useState("10");
  const [rateClickInput, setRateClickInput] = useState("5");
  const [rateViewInput, setRateViewInput] = useState("1");
  const [savedClickTarget, setSavedClickTarget] = useState(5);
  const [savedViewTarget, setSavedViewTarget] = useState(1);
  const [effectiveClick, setEffectiveClick] = useState(5);
  const [effectiveView, setEffectiveView] = useState(1);
  const [throttleActive, setThrottleActive] = useState(false);
  const [throttleLastRunAt, setThrottleLastRunAt] = useState<string | null>(null);
  const [throttleLastMarginPct, setThrottleLastMarginPct] = useState<number | null>(null);
  const [adRewardInput, setAdRewardInput] = useState("40");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${API_BASE}/admin/platform-settings`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/rates`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      }).then((r) => r.json()),
    ])
      .then(([settingsRes, ratesRes]) => {
        setWatchPayoutGpc(String(settingsRes.watch_payout_gpc ?? 10));
        setAdRewardInput(String(Math.round(Number(settingsRes.ad_reward_percent ?? 40))));
        const ck = Math.floor(Number(ratesRes.click_payout_target_cents ?? 5));
        const vw = Math.floor(Number(ratesRes.view_payout_target_cents ?? 1));
        setSavedClickTarget(ck);
        setSavedViewTarget(vw);
        setEffectiveClick(Math.floor(Number(ratesRes.click_payout_effective_cents ?? ck)));
        setEffectiveView(Math.floor(Number(ratesRes.view_payout_effective_cents ?? vw)));
        setThrottleActive(!!ratesRes.throttle_active);
        setThrottleLastRunAt(ratesRes.throttle_last_run_at ?? null);
        setThrottleLastMarginPct(
          ratesRes.throttle_last_margin_pct == null ? null : Number(ratesRes.throttle_last_margin_pct)
        );
        setRateClickInput(String(ck));
        setRateViewInput(String(vw));
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.adminId]);

  async function saveWatchPayout() {
    const gpc = Math.floor(Number(watchPayoutGpc));
    if (!Number.isFinite(gpc) || gpc < 1) {
      setError("Watch GPC must be at least 1");
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
        body: JSON.stringify({ watch_payout_gpc: gpc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Save failed");
      setSuccess("Watch payout saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveRates() {
    const click = parseInt(rateClickInput, 10);
    const view = parseInt(rateViewInput, 10);
    if (!Number.isInteger(click) || click < 0 || click > 100 || !Number.isInteger(view) || view < 0 || view > 100) {
      setError("Click and view payouts must be integers 0–100 (cents)");
      return;
    }
    setRatesSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/admin/rates`, {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ click_payout_cents: click, view_payout_cents: view }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Update failed");
      load();
      setSuccess("Legacy payout targets saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setRatesSaving(false);
    }
  }

  async function overrideThrottle() {
    if (!confirm("Bypass automatic throttle until the next margin run?")) return;
    setOverrideLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/throttle/override`, {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ restore_to_target: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Override failed");
      load();
      setSuccess("Throttle override applied.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Override failed");
    } finally {
      setOverrideLoading(false);
    }
  }

  async function saveAdReward() {
    const num = parseFloat(adRewardInput);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      setError("Ad reward % must be 0–100");
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
        body: JSON.stringify({ ad_reward_percent: num }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Save failed");
      setSuccess("Ad reward % saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-4 tablet:p-6 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-white">Platform Config</h1>
        <p className="text-sm text-fintech-muted mt-1">Watch earn, legacy throttle, and global settings.</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">{success}</p>}

      <section className="card-lux p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">Watch &amp; Earn</h2>
        <p className="text-sm text-fintech-muted">GPC awarded per completed 30-second video watch.</p>
        <div className="flex gap-2 items-end">
          <div>
            <label className="text-xs text-fintech-muted">GPC per 30s watch</label>
            <input
              type="number"
              min={1}
              value={watchPayoutGpc}
              onChange={(e) => setWatchPayoutGpc(e.target.value)}
              className="mt-1 block w-32 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <ActionButton onClick={() => void saveWatchPayout()} disabled={saving}>
            Save
          </ActionButton>
        </div>
      </section>

      <section className="card-lux p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white">Legacy click/view throttle</h2>
        <p className="text-sm text-fintech-muted">
          Targets for retired Garmon ad-session earn. History on{" "}
          <Link href="/admin/finance" className="text-fintech-accent hover:underline">
            Finance → Throttle History
          </Link>
          .
        </p>
        {throttleActive && (
          <div className="rounded-lg border border-[#f5c842]/40 bg-[#f5c842]/10 px-4 py-3 text-sm text-[#f5c842]">
            Throttle active · last run{" "}
            {throttleLastRunAt ? new Date(throttleLastRunAt).toLocaleString() : "—"}
            {throttleLastMarginPct != null ? ` · margin ${throttleLastMarginPct.toFixed(2)}%` : ""}
          </div>
        )}
        <div className="grid gap-4 max-w-md">
          <div>
            <label className="text-xs text-fintech-muted">Pay per click (¢ target)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={rateClickInput}
              onChange={(e) => setRateClickInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white text-sm"
            />
            <p className="text-xs text-fintech-muted mt-1">
              Effective: {effectiveClick}¢ · saved target: {savedClickTarget}¢
            </p>
          </div>
          <div>
            <label className="text-xs text-fintech-muted">Pay per view (¢ target)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={rateViewInput}
              onChange={(e) => setRateViewInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white text-sm"
            />
            <p className="text-xs text-fintech-muted mt-1">
              Effective: {effectiveView}¢ · saved target: {savedViewTarget}¢
            </p>
          </div>
          <ActionButton onClick={() => void saveRates()} disabled={ratesSaving}>
            {ratesSaving ? "Saving…" : "Save targets"}
          </ActionButton>
          {throttleActive && (
            <button
              type="button"
              disabled={overrideLoading}
              onClick={() => void overrideThrottle()}
              className="text-left text-sm text-amber-300 underline disabled:opacity-50"
            >
              {overrideLoading ? "Restoring…" : "Override throttle — restore target rates"}
            </button>
          )}
        </div>
      </section>

      <section className="card-lux p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">Ad revenue split</h2>
        <p className="text-xs text-amber-200/90">Legacy — for retired ad RPC only</p>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min={0}
            max={100}
            value={adRewardInput}
            onChange={(e) => setAdRewardInput(e.target.value)}
            className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
          />
          <span className="text-fintech-muted text-sm">% to users</span>
          <ActionButton onClick={() => void saveAdReward()} disabled={saving}>
            Save
          </ActionButton>
        </div>
      </section>

      <section className="card-lux p-5">
        <h2 className="text-lg font-semibold text-white mb-2">Game configuration</h2>
        <p className="text-sm text-fintech-muted mb-3">
          House edge and gamification settings live on the dedicated page.
        </p>
        <Link
          href="/admin/gamification"
          className="inline-flex rounded-xl bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d28d9]"
        >
          Open Gamification →
        </Link>
      </section>
    </div>
  );
}

export default function AdminConfigPage() {
  return (
    <AdminPageGate>
      <AdminConfigInner />
    </AdminPageGate>
  );
}
