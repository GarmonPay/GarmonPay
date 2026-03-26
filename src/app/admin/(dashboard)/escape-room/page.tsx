"use client";

import type { ComponentType, SVGProps } from "react";
import { useCallback, useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";
import {
  IconCreditCard,
  IconMegaphone,
  IconOverview,
  IconPeople,
  IconShield,
} from "@/components/admin/AdminGarmonTabIcons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const ACTION_BTN =
  "inline-flex items-center justify-center min-h-[36px] min-w-[60px] px-3 py-2 rounded-lg text-sm font-medium transition max-[480px]:w-full max-[480px]:min-w-0";

function IconPuzzle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

type TabId = "overview" | "players" | "sessions" | "financials" | "puzzles" | "anticheat" | "settings";
const TAB_ORDER: TabId[] = ["overview", "players", "sessions", "financials", "puzzles", "anticheat", "settings"];
const TAB_META: Record<TabId, { label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = {
  overview: { label: "Overview", Icon: IconOverview },
  players: { label: "Players", Icon: IconPeople },
  sessions: { label: "Sessions", Icon: IconMegaphone },
  financials: { label: "Financials", Icon: IconCreditCard },
  puzzles: { label: "Puzzles", Icon: IconPuzzle },
  anticheat: { label: "Anti-cheat", Icon: IconShield },
  settings: { label: "Settings", Icon: IconSettings },
};

export default function AdminEscapeRoomPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [players, setPlayers] = useState<Record<string, unknown>[]>([]);
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
  const [financials, setFinancials] = useState<Record<string, unknown> | null>(null);
  const [puzzles, setPuzzles] = useState<Record<string, unknown>[]>([]);
  const [flags, setFlags] = useState<Record<string, unknown>[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);

  const [puzzleForm, setPuzzleForm] = useState({
    puzzle_name: "",
    clue_transaction_id: "",
    clue_formula: "",
    clue_terminal_text: "",
    clue_cabinet_text: "",
    correct_pin: "",
    active_date: new Date().toISOString().slice(0, 10),
    difficulty_level: "medium",
    preview_text: "",
  });

  const loadAll = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const h = adminApiHeaders(session);
      const [st, pl, se, fi, pz, fl, sett] = await Promise.all([
        fetch(`${API_BASE}/admin/escape-room/stats`, { headers: h }).then((r) => r.json()),
        fetch(`${API_BASE}/admin/escape-room/players`, { headers: h }).then((r) => r.json()),
        fetch(`${API_BASE}/admin/escape-room/sessions?limit=80`, { headers: h }).then((r) => r.json()),
        fetch(`${API_BASE}/admin/escape-room/financials`, { headers: h }).then((r) => r.json()),
        fetch(`${API_BASE}/admin/escape-room/puzzles`, { headers: h }).then((r) => r.json()),
        fetch(`${API_BASE}/admin/escape-room/flags`, { headers: h }).then((r) => r.json()),
        fetch(`${API_BASE}/admin/escape-room/settings`, { headers: h }).then((r) => r.json()),
      ]);
      if (st.error) throw new Error(String(st.error));
      setStats(st);
      setPlayers((pl.players as Record<string, unknown>[]) ?? []);
      setSessions((se.sessions as Record<string, unknown>[]) ?? []);
      setFinancials(fi);
      setPuzzles((pz.puzzles as Record<string, unknown>[]) ?? []);
      setFlags((fl.flags as Record<string, unknown>[]) ?? []);
      setSettings((sett.settings as Record<string, unknown>) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (session) loadAll();
  }, [session, loadAll]);

  async function saveSettings() {
    if (!session || !settings) return;
    setActionError(null);
    const res = await fetch(`${API_BASE}/admin/escape-room/settings`, {
      method: "PATCH",
      headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(String(data.error ?? "Save failed"));
      return;
    }
    setSettings(data.settings as Record<string, unknown>);
  }

  async function createPuzzle(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setActionError(null);
    const res = await fetch(`${API_BASE}/admin/escape-room/puzzles`, {
      method: "POST",
      headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(puzzleForm),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(String(data.error ?? "Create failed"));
      return;
    }
    setPuzzleForm((f) => ({ ...f, puzzle_name: "", correct_pin: "" }));
    loadAll();
  }

  async function reviewFlag(id: string, status: string) {
    if (!session) return;
    setActionError(null);
    const res = await fetch(`${API_BASE}/admin/escape-room/flags`, {
      method: "PATCH",
      headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setActionError(String(data.error ?? "Update failed"));
    else loadAll();
  }

  async function banPlayer(playerId: string, status: "banned" | "suspended") {
    if (!session) return;
    setActionError(null);
    const res = await fetch(`${API_BASE}/admin/escape-room/ban`, {
      method: "POST",
      headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: playerId, status, reason: "Admin action" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setActionError(String(data.error ?? "Ban failed"));
    else loadAll();
  }

  async function approvePayout(sessionId: string) {
    if (!session) return;
    setActionError(null);
    const res = await fetch(`${API_BASE}/admin/escape-room/payouts`, {
      method: "POST",
      headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setActionError(String(data.error ?? "Payout failed"));
    else loadAll();
  }

  const statCards = stats
    ? [
        { label: "Live active sessions", value: String(stats.live_active_sessions ?? "—") },
        { label: "Online (15m)", value: String(stats.online_last_15m ?? "—") },
        { label: "Pool gross today", value: `$${(Number(stats.pool_gross_cents_today) / 100).toFixed(2)}` },
        { label: "Platform fee today", value: `$${(Number(stats.platform_fee_cents_today) / 100).toFixed(2)}` },
        { label: "Payouts paid today", value: `$${(Number(stats.payouts_paid_cents_today) / 100).toFixed(2)}` },
        { label: "Games (all time)", value: String(stats.total_games_all_time ?? "—") },
        { label: "Unique players", value: String(stats.unique_players_all_time ?? "—") },
        { label: "Avg escape (winners)", value: `${stats.avg_escape_seconds_winners ?? "—"}s` },
        { label: "Success rate", value: `${stats.escape_success_rate_pct ?? "—"}%` },
      ]
    : [];

  return (
    <div className="space-y-8 py-6 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Stake & Escape — Admin</h1>
          <p className="text-[#9ca3af]">Live sessions, puzzles, financials, anti-cheat review, settings.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${ACTION_BTN} bg-white/10 text-[#9ca3af] hover:bg-white/15 border border-white/10`}
            onClick={() => loadAll()}
          >
            Refresh
          </button>
          <a
            href={`${API_BASE}/admin/escape-room/sessions?format=csv&limit=500`}
            className={`${ACTION_BTN} text-center bg-[#2563eb]/30 text-white border border-[#2563eb]/50 no-underline`}
          >
            Export sessions CSV
          </a>
        </div>
      </div>

      <div className="relative md:mb-2">
        <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max min-w-full gap-2 flex-nowrap">
            {TAB_ORDER.map((tab) => {
              const { label, Icon } = TAB_META[tab];
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex shrink-0 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap min-w-[120px] ${
                    active
                      ? "border-[#eab308] bg-[#eab308]/15 text-[#fde047]"
                      : "border-white/10 bg-white/5 text-[#9ca3af] hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <AdminScrollHint />
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>}
      {actionError && <div className="p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{actionError}</div>}
      {loading && <p className="text-[#9ca3af]">Loading…</p>}

      {activeTab === "overview" && stats && !loading && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {statCards.map((c) => (
              <div key={c.label} className="rounded-xl border border-white/10 bg-[#0f172a] p-4 shadow-lg">
                <div className="text-xs text-[#94a3b8]">{c.label}</div>
                <div className="text-xl font-semibold text-white mt-1">{c.value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0f172a] p-4">
            <h2 className="text-sm font-semibold text-[#fde047] mb-3">Revenue (7-day fee)</h2>
            <div className="flex items-end gap-2 h-32">
              {(() => {
                const chart = (stats.revenue_chart as { label: string; cents: number }[]) ?? [];
                const maxC = Math.max(1, ...chart.map((x) => x.cents));
                return chart.map((b) => (
                  <div key={b.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div
                      className="w-full rounded-t bg-violet-500/80 min-h-[4px] transition-all"
                      style={{ height: `${(b.cents / maxC) * 100}%` }}
                      title={`${b.label}: ${(b.cents / 100).toFixed(2)}`}
                    />
                    <span className="text-[10px] text-[#64748b]">{b.label.slice(5)}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0f172a] p-4">
            <h2 className="text-sm font-semibold text-white mb-2">Active sessions</h2>
            <AdminTableWrap>
              <table className="w-full text-sm text-left text-[#cbd5e1]">
                <thead className="text-xs text-[#94a3b8] border-b border-white/10">
                  <tr>
                    <th className="py-2 pr-2">Player</th>
                    <th className="py-2 pr-2">Mode</th>
                    <th className="py-2 pr-2">Stake</th>
                    <th className="py-2">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {((stats.active_sessions as Record<string, unknown>[]) ?? []).map((r) => (
                    <tr key={String(r.id)} className="border-b border-white/5">
                      <td className="py-2 pr-2 break-all">{String(r.email ?? r.player_id).slice(0, 28)}</td>
                      <td className="py-2 pr-2">{String(r.mode)}</td>
                      <td className="py-2 pr-2">${(Number(r.stake_cents) / 100).toFixed(2)}</td>
                      <td className="py-2 text-xs">{String(r.started_at).slice(11, 19)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
          </div>
        </div>
      )}

      {activeTab === "players" && (
        <AdminTableWrap>
          <table className="w-full text-sm text-left text-[#cbd5e1]">
            <thead className="text-xs text-[#94a3b8] border-b border-white/10">
              <tr>
                <th className="py-2 pr-2">Email</th>
                <th className="py-2 pr-2">Games</th>
                <th className="py-2 pr-2">Staked</th>
                <th className="py-2 pr-2">Won</th>
                <th className="py-2 pr-2">Win %</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={String(p.player_id)} className="border-b border-white/5">
                  <td className="py-2 pr-2 break-all max-w-[140px]">{String(p.email ?? p.player_id)}</td>
                  <td className="py-2 pr-2">{String(p.games)}</td>
                  <td className="py-2 pr-2">${(Number(p.staked) / 100).toFixed(2)}</td>
                  <td className="py-2 pr-2">${(Number(p.won) / 100).toFixed(2)}</td>
                  <td className="py-2 pr-2">{String(p.win_rate_pct)}%</td>
                  <td className="py-2 pr-2">{String(p.status)}</td>
                  <td className="py-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-red-500/20 text-red-400 text-xs"
                      onClick={() => banPlayer(String(p.player_id), "banned")}
                    >
                      Ban
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 text-xs"
                      onClick={() => banPlayer(String(p.player_id), "suspended")}
                    >
                      Suspend
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableWrap>
      )}

      {activeTab === "sessions" && (
        <AdminTableWrap>
          <table className="w-full text-sm text-left text-[#cbd5e1]">
            <thead className="text-xs text-[#94a3b8] border-b border-white/10">
              <tr>
                <th className="py-2 pr-2">ID</th>
                <th className="py-2 pr-2">Mode</th>
                <th className="py-2 pr-2">Stake</th>
                <th className="py-2 pr-2">Result</th>
                <th className="py-2 pr-2">Escape s</th>
                <th className="py-2 pr-2">Payout</th>
                <th className="py-2">Pay status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={String(s.id)} className="border-b border-white/5">
                  <td className="py-2 pr-2 font-mono text-xs break-all max-w-[100px]">{String(s.id).slice(0, 8)}…</td>
                  <td className="py-2 pr-2">{String(s.mode)}</td>
                  <td className="py-2 pr-2">${(Number(s.stake_cents) / 100).toFixed(2)}</td>
                  <td className="py-2 pr-2">{String(s.result)}</td>
                  <td className="py-2 pr-2">{s.escape_time_seconds != null ? String(s.escape_time_seconds) : "—"}</td>
                  <td className="py-2 pr-2">${(Number(s.payout_cents) / 100).toFixed(2)}</td>
                  <td className="py-2 text-xs">
                    {String(s.payout_status)}
                    {String(s.payout_status) === "pending" && (
                      <button
                        type="button"
                        className="ml-2 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400"
                        onClick={() => approvePayout(String(s.id))}
                      >
                        Pay
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableWrap>
      )}

      {activeTab === "financials" && financials && (
        <div className="space-y-4 text-[#cbd5e1] text-sm">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-[#0f172a] p-4">
              <div className="text-xs text-[#94a3b8]">Stake gross (range)</div>
              <div className="text-lg text-white font-semibold">
                ${(Number(financials.stake_gross_cents_in_range) / 100).toFixed(2)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0f172a] p-4">
              <div className="text-xs text-[#94a3b8]">Platform fee (range)</div>
              <div className="text-lg text-[#eab308] font-semibold">
                ${(Number(financials.platform_fee_cents_in_range) / 100).toFixed(2)}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0f172a] p-4">
            <h3 className="text-[#fde047] font-medium mb-2">Pending payouts</h3>
            <ul className="space-y-2">
              {((financials.pending_payouts as Record<string, unknown>[]) ?? []).map((p) => (
                <li key={String(p.id)} className="flex flex-wrap justify-between gap-2 border-b border-white/5 pb-2">
                  <span className="font-mono text-xs">{String(p.session_id).slice(0, 8)}…</span>
                  <span>${(Number(p.amount_cents) / 100).toFixed(2)}</span>
                  <button
                    type="button"
                    className="text-emerald-400 text-xs"
                    onClick={() => approvePayout(String(p.session_id))}
                  >
                    Approve pay
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0f172a] p-4">
            <h3 className="text-amber-400 font-medium mb-2">Failed wallet / alerts</h3>
            <ul className="space-y-1 text-xs">
              {((financials.failed_wallet_sessions as Record<string, unknown>[]) ?? []).map((r) => (
                <li key={String(r.id)}>
                  {String(r.id).slice(0, 8)} — ${(Number(r.payout_cents) / 100).toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === "puzzles" && (
        <div className="space-y-6">
          <form
            onSubmit={createPuzzle}
            className="rounded-xl border border-white/10 bg-[#0f172a] p-4 grid gap-3 md:grid-cols-2 text-sm"
          >
            <label className="md:col-span-2 text-[#94a3b8] text-xs uppercase">New puzzle</label>
            <input
              className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
              placeholder="Name"
              value={puzzleForm.puzzle_name}
              onChange={(e) => setPuzzleForm((f) => ({ ...f, puzzle_name: e.target.value }))}
            />
            <input
              className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
              placeholder="Transaction ID clue"
              value={puzzleForm.clue_transaction_id}
              onChange={(e) => setPuzzleForm((f) => ({ ...f, clue_transaction_id: e.target.value }))}
            />
            <input
              className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white md:col-span-2"
              placeholder="Formula hint"
              value={puzzleForm.clue_formula}
              onChange={(e) => setPuzzleForm((f) => ({ ...f, clue_formula: e.target.value }))}
            />
            <textarea
              className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white md:col-span-2"
              placeholder="Terminal text"
              rows={2}
              value={puzzleForm.clue_terminal_text}
              onChange={(e) => setPuzzleForm((f) => ({ ...f, clue_terminal_text: e.target.value }))}
            />
            <textarea
              className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white md:col-span-2"
              placeholder="Cabinet text"
              rows={2}
              value={puzzleForm.clue_cabinet_text}
              onChange={(e) => setPuzzleForm((f) => ({ ...f, clue_cabinet_text: e.target.value }))}
            />
            <input
              className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
              placeholder="4-digit PIN"
              value={puzzleForm.correct_pin}
              onChange={(e) => setPuzzleForm((f) => ({ ...f, correct_pin: e.target.value }))}
            />
            <input
              type="date"
              className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
              value={puzzleForm.active_date}
              onChange={(e) => setPuzzleForm((f) => ({ ...f, active_date: e.target.value }))}
            />
            <button
              type="submit"
              className="md:col-span-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium py-2"
            >
              Create puzzle
            </button>
          </form>
          <AdminTableWrap>
            <table className="w-full text-sm text-left text-[#cbd5e1]">
              <thead className="text-xs text-[#94a3b8] border-b border-white/10">
                <tr>
                  <th className="py-2 pr-2">Name</th>
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">PIN</th>
                  <th className="py-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {puzzles.map((pz) => (
                  <tr key={String(pz.id)} className="border-b border-white/5">
                    <td className="py-2 pr-2">{String(pz.puzzle_name)}</td>
                    <td className="py-2 pr-2">{String(pz.active_date)}</td>
                    <td className="py-2 pr-2 font-mono">{String(pz.correct_pin)}</td>
                    <td className="py-2">{String(pz.is_active)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        </div>
      )}

      {activeTab === "anticheat" && (
        <AdminTableWrap>
          <table className="w-full text-sm text-left text-[#cbd5e1]">
            <thead className="text-xs text-[#94a3b8] border-b border-white/10">
              <tr>
                <th className="py-2 pr-2">Session</th>
                <th className="py-2 pr-2">Reason</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2">Review</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={String(f.id)} className="border-b border-white/5">
                  <td className="py-2 pr-2 font-mono text-xs break-all max-w-[120px]">{String(f.session_id)}</td>
                  <td className="py-2 pr-2">{String(f.reason)}</td>
                  <td className="py-2 pr-2">{String(f.status)}</td>
                  <td className="py-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-xs"
                      onClick={() => reviewFlag(String(f.id), "legit")}
                    >
                      Legit
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-red-500/20 text-red-400 text-xs"
                      onClick={() => reviewFlag(String(f.id), "cheated")}
                    >
                      Cheated
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableWrap>
      )}

      {activeTab === "settings" && settings && (
        <div className="rounded-xl border border-white/10 bg-[#0f172a] p-4 space-y-3 text-sm max-w-xl">
          {(
            [
              ["free_play_enabled", "Free play"],
              ["stake_mode_enabled", "Stake mode"],
              ["daily_puzzle_rotation_enabled", "Daily puzzle rotation"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[#cbd5e1]">
              <input
                type="checkbox"
                checked={!!settings[key]}
                onChange={(e) => setSettings((s) => (s ? { ...s, [key]: e.target.checked } : s))}
              />
              {label}
            </label>
          ))}
          {(
            [
              ["min_stake_cents", "Min stake (¢)"],
              ["max_stake_cents", "Max stake (¢)"],
              ["platform_fee_percent", "Platform fee %"],
              ["top1_split_percent", "Top 1 %"],
              ["top2_split_percent", "Top 2 %"],
              ["top3_split_percent", "Top 3 %"],
              ["countdown_seconds", "Countdown seconds"],
              ["suspicious_min_escape_seconds", "Suspicious max time (s)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-[#94a3b8] text-xs">
              {label}
              <input
                type="number"
                className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
                value={Number(settings[key] ?? 0)}
                onChange={(e) =>
                  setSettings((s) => (s ? { ...s, [key]: Number(e.target.value) } : s))
                }
              />
            </label>
          ))}
          <label className="block text-[#94a3b8] text-xs">
            Maintenance banner (empty = off)
            <textarea
              className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
              rows={2}
              value={String(settings.maintenance_banner ?? "")}
              onChange={(e) => setSettings((s) => (s ? { ...s, maintenance_banner: e.target.value } : s))}
            />
          </label>
          <button
            type="button"
            onClick={saveSettings}
            className="w-full rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium py-2"
          >
            Save settings
          </button>
        </div>
      )}
    </div>
  );
}
