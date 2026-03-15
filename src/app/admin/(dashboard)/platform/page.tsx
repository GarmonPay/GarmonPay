"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

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

export default function AdminPlatformPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [balance, setBalance] = useState<{
    balance_cents: number;
    total_revenue_cents: number;
    total_rewards_paid_cents: number;
  } | null>(null);
  const [adRewardPct, setAdRewardPct] = useState<number>(40);
  const [adRewardInput, setAdRewardInput] = useState("40");
  const [gameConfig, setGameConfig] = useState<Record<string, number>>({});
  const [gameInputs, setGameInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  function load() {
    if (!session) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${API_BASE}/admin/platform-balance`, { credentials: "include", headers: adminApiHeaders(session) }).then(
        (r) => r.json()
      ),
      fetch(`${API_BASE}/admin/platform-settings`, { credentials: "include", headers: adminApiHeaders(session) }).then(
        (r) => r.json()
      ),
      fetch(`${API_BASE}/admin/game-config`, { credentials: "include", headers: adminApiHeaders(session) }).then(
        (r) => r.json()
      ),
    ])
      .then(([balanceRes, settingsRes, gameRes]) => {
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

  async function saveAdReward() {
    if (!session) return;
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
    if (!session) return;
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

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <p className="text-[#9ca3af]">Redirecting to admin login…</p>
      </div>
    );
  }
  if (loading && !balance) {
    return (
      <div className="p-6">
        <p className="text-[#9ca3af]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Platform & Profit Protection</h1>
      <p className="text-[#9ca3af] mb-6">
        Configure ad reward share, per-game house edge, and view platform balance. Referral commission tiers are in{" "}
        <Link href="/admin/referrals" className="text-blue-400 hover:underline">
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

      {/* Platform balance (read-only) */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3">Platform Balance</h2>
        <p className="text-[#9ca3af] text-sm mb-3">
          Total rewards paid cannot exceed total revenue. Payouts are blocked when balance or revenue is insufficient.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
            <p className="text-[#9ca3af] text-sm">Available balance</p>
            <p className="text-2xl font-bold text-white">{balance ? formatCents(balance.balance_cents) : "—"}</p>
          </div>
          <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
            <p className="text-[#9ca3af] text-sm">Total revenue generated</p>
            <p className="text-2xl font-bold text-white">{balance ? formatCents(balance.total_revenue_cents) : "—"}</p>
          </div>
          <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
            <p className="text-[#9ca3af] text-sm">Total rewards paid</p>
            <p className="text-2xl font-bold text-white">{balance ? formatCents(balance.total_rewards_paid_cents) : "—"}</p>
          </div>
        </div>
      </section>

      {/* Ad reward % */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3">Ad revenue split</h2>
        <p className="text-[#9ca3af] text-sm mb-3">
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
          <span className="text-[#9ca3af] text-sm">% to users</span>
          <button
            type="button"
            disabled={saving}
            onClick={saveAdReward}
            className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </section>

      {/* Game house edge */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3">Game house edge</h2>
        <p className="text-[#9ca3af] text-sm mb-4">
          House edge (percent) per game. Platform keeps this edge; the rest can be paid as rewards.
        </p>
        <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-3 text-sm font-medium text-[#9ca3af]">Game</th>
                <th className="p-3 text-sm font-medium text-[#9ca3af]">House edge %</th>
                <th className="p-3 text-sm font-medium text-[#9ca3af]">Action</th>
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
                    <span className="ml-2 text-[#9ca3af] text-sm">%</span>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => saveGameEdge(gameName)}
                      className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-500 disabled:opacity-50"
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

      <p className="text-[#9ca3af] text-xs">
        Referral commission tiers:{" "}
        <Link href="/admin/referrals" className="text-blue-400 hover:underline">
          /admin/referrals
        </Link>
      </p>
    </div>
  );
}
