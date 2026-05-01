"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import { ActionButton } from "@/components/admin/ActionButton";

const API_BASE = getApiRoot();

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function gameLabel(name: string) {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type GameName = "spin_wheel" | "scratch_card" | "pinball" | "mystery_box";

function AdminPlatformPageInner() {
  const session = useAdminSession();
  const [balance, setBalance] = useState<{
    balance_cents: number;
    total_revenue_cents: number;
    total_rewards_paid_cents: number;
  } | null>(null);
  const [rateClickInput, setRateClickInput] = useState("5");
  const [rateViewInput, setRateViewInput] = useState("1");
  /** Admin targets (saved ceiling). */
  const [savedClickTarget, setSavedClickTarget] = useState(5);
  const [savedViewTarget, setSavedViewTarget] = useState(1);
  /** Effective payout after throttle. */
  const [effectiveClick, setEffectiveClick] = useState(5);
  const [effectiveView, setEffectiveView] = useState(1);
  const [throttleActive, setThrottleActive] = useState(false);
  const [throttleLastRunAt, setThrottleLastRunAt] = useState<string | null>(null);
  const [throttleLastMarginPct, setThrottleLastMarginPct] = useState<number | null>(null);
  const [ratesSuccess, setRatesSuccess] = useState<string | null>(null);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [overrideLoading, setOverrideLoading] = useState(false);

  const [adRewardPct, setAdRewardPct] = useState<number>(40);
  const [adRewardInput, setAdRewardInput] = useState("40");
  const [gameConfig, setGameConfig] = useState<Record<string, number>>({});
  const [gameInputs, setGameInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${API_BASE}/admin/platform-balance`, { credentials: "include", headers: adminApiHeaders(session) }).then(
        (r) => r.json()
      ),
      fetch(`${API_BASE}/admin/platform-settings`, { credentials: "include", headers: adminApiHeaders(session) }).then(
        (r) => r.json()
      ),
      fetch(`${API_BASE}/admin/rates`, { credentials: "include", headers: adminApiHeaders(session) }).then((r) =>
        r.json()
      ),
      fetch(`${API_BASE}/admin/game-config`, { credentials: "include", headers: adminApiHeaders(session) }).then(
        (r) => r.json()
      ),
    ])
      .then(([balanceRes, settingsRes, ratesRes, gameRes]) => {
        if (balanceRes.balance_cents !== undefined) {
          setBalance({
            balance_cents: balanceRes.balance_cents ?? 0,
            total_revenue_cents: balanceRes.total_revenue_cents ?? 0,
            total_rewards_paid_cents: balanceRes.total_rewards_paid_cents ?? 0,
          });
        }
        const pct = Number(settingsRes.ad_reward_percent ?? 40);
        setAdRewardPct(pct);
        setAdRewardInput(String(pct));
        const ck = Math.floor(
          Number(ratesRes.click_payout_target_cents ?? ratesRes.click_payout_cents ?? 5)
        );
        const vw = Math.floor(
          Number(ratesRes.view_payout_target_cents ?? ratesRes.view_payout_cents ?? 1)
        );
        const ec = Math.floor(
          Number(ratesRes.click_payout_effective_cents ?? ck)
        );
        const ev = Math.floor(
          Number(ratesRes.view_payout_effective_cents ?? vw)
        );
        setSavedClickTarget(ck);
        setSavedViewTarget(vw);
        setEffectiveClick(ec);
        setEffectiveView(ev);
        setThrottleActive(!!ratesRes.throttle_active);
        setThrottleLastRunAt(ratesRes.throttle_last_run_at ?? null);
        setThrottleLastMarginPct(
          ratesRes.throttle_last_margin_pct === null || ratesRes.throttle_last_margin_pct === undefined
            ? null
            : Number(ratesRes.throttle_last_margin_pct)
        );
        setRateClickInput(String(ck));
        setRateViewInput(String(vw));
        const config = gameRes.config ?? {};
        setGameConfig(config);
        const inputs: Record<string, string> = {};
        ["spin_wheel", "scratch_card", "pinball", "mystery_box"].forEach((name) => {
          inputs[name] = String(config[name] ?? 10);
        });
        setGameInputs(inputs);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.adminId]);

  async function saveRates() {
    const click = parseInt(rateClickInput, 10);
    const view = parseInt(rateViewInput, 10);
    if (!Number.isInteger(click) || click < 0 || click > 100 || !Number.isInteger(view) || view < 0 || view > 100) {
      setError("Click and view payouts must be integers from 0 to 100 (cents)");
      return;
    }
    setRatesSaving(true);
    setError(null);
    setRatesSuccess(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/admin/rates`, {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ click_payout_cents: click, view_payout_cents: view }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.message as string) || "Update failed");
        return;
      }
      const nt = Math.floor(Number(data.click_payout_target_cents ?? data.click_payout_cents ?? click));
      const nv = Math.floor(Number(data.view_payout_target_cents ?? data.view_payout_cents ?? view));
      setSavedClickTarget(nt);
      setSavedViewTarget(nv);
      setEffectiveClick(Math.floor(Number(data.click_payout_effective_cents ?? nt)));
      setEffectiveView(Math.floor(Number(data.view_payout_effective_cents ?? nv)));
      setThrottleActive(!!data.throttle_active);
      setThrottleLastRunAt(data.throttle_last_run_at ?? null);
      setThrottleLastMarginPct(
        data.throttle_last_margin_pct === null || data.throttle_last_margin_pct === undefined
          ? null
          : Number(data.throttle_last_margin_pct)
      );
      setRatesSuccess("Rates updated. New rate applies on next click/view.");
      setTimeout(() => setRatesSuccess(null), 5000);
    } catch {
      setError("Request failed");
    } finally {
      setRatesSaving(false);
    }
  }

  async function overrideThrottle() {
    if (
      !confirm(
        "Are you sure? This bypasses automatic protection until the next throttle run adjusts rates again."
      )
    ) {
      return;
    }
    setOverrideLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/throttle/override`, {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ restore_to_target: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.message as string) || "Override failed");
        return;
      }
      setThrottleActive(false);
      setEffectiveClick(savedClickTarget);
      setEffectiveView(savedViewTarget);
      setRatesSuccess("Throttle cleared — effective rates restored to targets.");
      setTimeout(() => setRatesSuccess(null), 5000);
      load();
    } catch {
      setError("Request failed");
    } finally {
      setOverrideLoading(false);
    }
  }

  async function saveAdReward() {
    const num = parseFloat(adRewardInput);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      setError("Enter a number between 0 and 100");
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.message as string) || "Update failed");
        return;
      }
      setSuccess(`Ad reward set to ${num}%`);
      setAdRewardPct(num);
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Request failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveGameEdge(gameName: GameName) {
    const value = gameInputs[gameName] ?? "10";
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      setError("Enter a number between 0 and 100");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/admin/game-config`, {
        method: "PATCH",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ game_name: gameName, house_edge_percent: num }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.message as string) || "Update failed");
        return;
      }
      setSuccess(`${gameLabel(gameName)} house edge set to ${num}%`);
      setGameConfig((prev) => ({ ...prev, [gameName]: num }));
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch {
      setError("Request failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !balance) {
    return (
      <div className="p-6">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-2">Platform & Profit Protection</h1>
      <p className="text-fintech-muted mb-6">
        Configure ad reward share, per-game house edge, and view platform balance. Referral commission tiers are in{" "}
        <Link href="/admin/referrals" className="text-fintech-accent hover:underline">
          Referrals
        </Link>
        .
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/20 text-green-400 text-sm">{success}</div>
      )}
      {ratesSuccess && (
        <div className="mb-4 p-3 rounded-lg border border-[#7c3aed]/35 bg-[#7c3aed]/15 text-sm text-white">
          {ratesSuccess}
        </div>
      )}

      {/* Platform balance (read-only) */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3">Platform Balance</h2>
        <p className="text-fintech-muted text-sm mb-3">
          Total rewards paid cannot exceed total revenue. Payouts are blocked when balance or revenue is insufficient.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-4">
            <p className="text-fintech-muted text-sm">Available balance</p>
            <p className="text-2xl font-bold text-white">{balance ? formatCents(balance.balance_cents) : "—"}</p>
          </div>
          <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-4">
            <p className="text-fintech-muted text-sm">Total revenue generated</p>
            <p className="text-2xl font-bold text-white">{balance ? formatCents(balance.total_revenue_cents) : "—"}</p>
          </div>
          <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-4">
            <p className="text-fintech-muted text-sm">Total rewards paid</p>
            <p className="text-2xl font-bold text-white">{balance ? formatCents(balance.total_rewards_paid_cents) : "—"}</p>
          </div>
        </div>
      </section>

      {/* Garmon member payout rates (cents) */}
      <section className="mb-8 rounded-xl border border-[#7c3aed]/25 bg-[#0e0118] p-5">
        <h2 className="font-[family-name:var(--font-admin-display)] text-lg font-bold text-white mb-2">
          User Payout Rates
        </h2>
        <p className="text-sm text-white/60 mb-4">
          How much each user earns when they click or view a Garmon ad. Target is your ceiling; effective is what
          members receive after any margin throttle.
        </p>
        {throttleActive && (
          <div className="mb-4 rounded-lg border border-[#f5c842]/40 bg-[#f5c842]/10 px-4 py-3 text-sm text-[#f5c842]">
            <p className="font-medium text-white mb-1">Margin auto-throttle is active</p>
            <p className="text-white/80">
              Your target rates are saved but effective rates are reduced to protect platform margin. Last check:{" "}
              {throttleLastRunAt
                ? new Date(throttleLastRunAt).toLocaleString(undefined, { timeZone: "UTC" }) + " UTC"
                : "—"}
              {throttleLastMarginPct !== null && throttleLastMarginPct !== undefined
                ? ` · Observed margin: ${Number(throttleLastMarginPct).toFixed(2)}%`
                : ""}
            </p>
            <Link
              href="/admin/throttle-log"
              className="inline-block mt-2 text-[#f5c842] underline text-xs hover:text-white"
            >
              View throttle log
            </Link>
          </div>
        )}
        <div className="flex flex-col gap-4 max-w-lg">
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1">Pay user per click (cents)</label>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-white/50 w-14 shrink-0">Target</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={rateClickInput}
                onChange={(e) => setRateClickInput(e.target.value)}
                className="flex-1 min-w-[120px] rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white text-sm"
              />
              <span className="text-xs text-[#f5c842]/95 whitespace-nowrap">Effective: {effectiveClick}¢</span>
            </div>
            <p className="mt-1 text-xs text-white/45">Current target: {savedClickTarget}¢</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1">Pay user per view (cents)</label>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-white/50 w-14 shrink-0">Target</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={rateViewInput}
                onChange={(e) => setRateViewInput(e.target.value)}
                className="flex-1 min-w-[120px] rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white text-sm"
              />
              <span className="text-xs text-[#f5c842]/95 whitespace-nowrap">Effective: {effectiveView}¢</span>
            </div>
            <p className="mt-1 text-xs text-white/45">Current target: {savedViewTarget}¢</p>
          </div>
          <ActionButton type="button" variant="gold" disabled={ratesSaving} onClick={() => void saveRates()}>
            {ratesSaving ? "Saving…" : "Save Rates"}
          </ActionButton>
          {throttleActive && (
            <button
              type="button"
              disabled={overrideLoading}
              onClick={() => void overrideThrottle()}
              className="text-left text-sm text-amber-300/95 hover:text-amber-200 underline disabled:opacity-50"
            >
              {overrideLoading ? "Restoring…" : "Override throttle and restore target rates"}
            </button>
          )}
        </div>
      </section>

      {/* Ad reward % */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3">Ad revenue split</h2>
        <p className="text-fintech-muted text-sm mb-3">
          Users receive this percentage of ad revenue; the platform keeps the rest. Default 40%.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={adRewardInput}
            onChange={(e) => setAdRewardInput(e.target.value)}
            className="w-24 px-2 py-1 rounded bg-black/30 border border-white/20 text-white text-sm"
          />
          <span className="text-fintech-muted text-sm">% to users</span>
          <button
            type="button"
            disabled={saving}
            onClick={saveAdReward}
            className="px-3 py-1 rounded-xl bg-fintech-accent text-white text-sm hover:bg-fintech-accent/90 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </section>

      {/* Game house edge */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3">Game house edge</h2>
        <p className="text-fintech-muted text-sm mb-4">
          House edge (percent) per game. Platform keeps this edge; the rest can be paid as rewards.
        </p>
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-3 text-sm font-medium text-fintech-muted">Game</th>
                <th className="p-3 text-sm font-medium text-fintech-muted">House edge %</th>
                <th className="p-3 text-sm font-medium text-fintech-muted">Action</th>
              </tr>
            </thead>
            <tbody>
              {(["spin_wheel", "scratch_card", "pinball", "mystery_box"] as GameName[]).map((gameName) => (
                <tr key={gameName} className="border-b border-white/5">
                  <td className="p-3 text-white font-medium">{gameLabel(gameName)}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={gameInputs[gameName] ?? "10"}
                      onChange={(e) => setGameInputs((prev) => ({ ...prev, [gameName]: e.target.value }))}
                      className="w-24 px-2 py-1 rounded bg-black/30 border border-white/20 text-white text-sm"
                    />
                    <span className="ml-2 text-fintech-muted text-sm">%</span>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => saveGameEdge(gameName)}
                      className="px-3 py-1 rounded-xl bg-fintech-accent text-white text-sm hover:bg-fintech-accent/90 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-fintech-muted text-xs">
        Referral commission tiers:{" "}
        <Link href="/admin/referrals" className="text-fintech-accent hover:underline">
          /admin/referrals
        </Link>
      </p>
    </div>
  );
}

export default function AdminPlatformPage() {
  return (
    <AdminPageGate>
      <AdminPlatformPageInner />
    </AdminPageGate>
  );
}
