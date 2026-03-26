"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

type AdminTab =
  | "overview"
  | "players"
  | "sessions"
  | "financials"
  | "puzzles"
  | "antiCheat"
  | "settings";

type EscapeStats = {
  playersOnline: number;
  activeSessions: Array<{
    id: string;
    player_id: string;
    email: string;
    mode: "free" | "stake";
    stake_cents: number;
    elapsed_seconds: number;
    started_at: string;
  }>;
  totalPrizePoolCents: number;
  totalRevenueCents: number;
  totalPayoutsCents: number;
  totalGamesPlayed: number;
  totalMembersPlayed: number;
  avgEscapeTimeSeconds: number;
  escapeSuccessRatePercent: number;
  revenueSeries: Array<{ day: string; stake: number; fee: number; payout: number; games: number }>;
  pendingPayoutCount: number;
};

type PlayerRow = {
  user_id: string;
  email: string;
  games_played: number;
  total_staked_cents: number;
  total_won_cents: number;
  total_lost_cents: number;
  win_rate_percent: number;
  last_played_at: string | null;
  status: "active" | "suspended" | "banned";
  flagged_suspicious: boolean;
};

type SessionRow = {
  id: string;
  player_id: string;
  mode: "free" | "stake";
  stake_cents: number;
  started_at: string;
  ended_at: string | null;
  server_elapsed_seconds?: number | null;
  escape_time_seconds: number | null;
  result: "active" | "win" | "lose" | "timeout" | "voided";
  payout_cents: number;
  payout_status: string;
  suspicious: boolean;
};

type ReplayPayload = {
  session: SessionRow | null;
  timerLogs: Array<{
    id: number;
    event_type: string;
    server_time: string;
    payload: Record<string, unknown>;
  }>;
};

type Financials = {
  totalRevenueCents: number;
  totalStakedCents: number;
  totalPaidCents: number;
  pendingPayouts: Array<{
    id: string;
    session_id: string;
    player_id: string;
    amount_cents: number;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;
  payoutHistory: Array<{
    id: string;
    session_id: string;
    player_id: string;
    amount_cents: number;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;
  payoutFailures: Array<{
    id: string;
    session_id: string;
    player_id: string;
    amount_cents: number;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;
  dailyRevenue: Array<{ day: string; revenue: number; staked: number; paid: number }>;
};

type Puzzle = {
  id: string;
  puzzle_name: string;
  clue_transaction_id: string;
  clue_formula: string;
  clue_terminal_text: string | null;
  clue_cabinet_text: string | null;
  correct_pin: string;
  difficulty_level: "easy" | "medium" | "hard" | "expert";
  active_date: string;
  is_active: boolean;
  preview_text: string | null;
  created_at: string;
  updated_at: string;
};

type FlagRow = {
  id: string;
  session_id: string;
  player_id: string;
  reason: string;
  flag_type: string;
  status: "pending" | "legit" | "cheated" | "voided";
  notes: string | null;
  created_at: string;
};

type Settings = {
  free_play_enabled: boolean;
  stake_mode_enabled: boolean;
  min_stake_cents: number;
  max_stake_cents: number;
  platform_fee_percent: number;
  top1_split_percent: number;
  top2_split_percent: number;
  top3_split_percent: number;
  countdown_seconds: number;
  daily_puzzle_rotation_enabled: boolean;
  maintenance_banner: string | null;
  suspicious_min_escape_seconds: number;
  large_payout_alert_cents: number;
  email_alert_large_payout: boolean;
  email_alert_suspicious: boolean;
  email_alert_wallet_errors: boolean;
};

function cents(c: number) {
  return `$${(Number(c || 0) / 100).toFixed(2)}`;
}

function compactSeconds(total: number) {
  const sec = Math.max(0, Math.floor(total || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "players", label: "Players" },
  { id: "sessions", label: "Game Sessions" },
  { id: "financials", label: "Financials" },
  { id: "puzzles", label: "Puzzles" },
  { id: "antiCheat", label: "Anti-Cheat" },
  { id: "settings", label: "Settings" },
];

export default function EscapeRoomAdminPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("overview");

  const [stats, setStats] = useState<EscapeStats | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [overviewRange, setOverviewRange] = useState<"daily" | "weekly" | "monthly">("daily");
  const [financialDateFrom, setFinancialDateFrom] = useState("");
  const [financialDateTo, setFinancialDateTo] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedReplay, setSelectedReplay] = useState<ReplayPayload | null>(null);

  const [sessionFilterMode, setSessionFilterMode] = useState<"all" | "free" | "stake">("all");
  const [sessionFilterResult, setSessionFilterResult] = useState<
    "all" | "active" | "win" | "lose" | "timeout" | "voided"
  >("all");
  const [playersSearch, setPlayersSearch] = useState("");

  const [newPuzzle, setNewPuzzle] = useState({
    puzzle_name: "",
    clue_transaction_id: "",
    clue_formula: "",
    clue_terminal_text: "",
    clue_cabinet_text: "",
    correct_pin: "",
    difficulty_level: "medium" as "easy" | "medium" | "hard" | "expert",
    active_date: new Date().toISOString().slice(0, 10),
    is_active: true,
    preview_text: "",
  });

  function headers() {
    return adminApiHeaders(session);
  }

  async function loadOverview(range = overviewRange) {
    const res = await fetch(`/api/admin/games/stats?range=${range}`, {
      credentials: "include",
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Overview failed (${res.status})`);
    const json = await res.json();
    setStats((json.stats ?? null) as EscapeStats | null);
  }

  async function loadPlayers() {
    const res = await fetch("/api/admin/games/sessions/players", {
      credentials: "include",
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Players failed (${res.status})`);
    const json = await res.json();
    setPlayers((json.players ?? []) as PlayerRow[]);
  }

  async function loadSessions() {
    const params = new URLSearchParams();
    params.set("mode", sessionFilterMode);
    params.set("result", sessionFilterResult);
    const res = await fetch(`/api/admin/games/sessions?${params.toString()}`, {
      credentials: "include",
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Sessions failed (${res.status})`);
    const json = await res.json();
    setSessions((json.sessions ?? []) as SessionRow[]);
  }

  async function loadFinancials() {
    const params = new URLSearchParams();
    if (financialDateFrom) params.set("from", new Date(financialDateFrom).toISOString());
    if (financialDateTo) {
      const dayEnd = new Date(financialDateTo);
      dayEnd.setHours(23, 59, 59, 999);
      params.set("to", dayEnd.toISOString());
    }
    const query = params.toString();
    const res = await fetch(`/api/admin/games/financials${query ? `?${query}` : ""}`, {
      credentials: "include",
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Financials failed (${res.status})`);
    const json = await res.json();
    setFinancials((json.financials ?? null) as Financials | null);
  }

  async function loadSessionReplay(sessionId: string) {
    const params = new URLSearchParams({ sessionId });
    const res = await fetch(`/api/admin/games/replay?${params.toString()}`, {
      credentials: "include",
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Replay failed (${res.status})`);
    const json = await res.json();
    setSelectedSessionId(sessionId);
    setSelectedReplay((json.replay ?? null) as ReplayPayload | null);
  }

  async function loadPuzzles() {
    const res = await fetch("/api/admin/games/puzzles", {
      credentials: "include",
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Puzzles failed (${res.status})`);
    const json = await res.json();
    setPuzzles((json.puzzles ?? []) as Puzzle[]);
  }

  async function loadFlags() {
    const res = await fetch("/api/admin/games/flags", {
      credentials: "include",
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Flags failed (${res.status})`);
    const json = await res.json();
    setFlags((json.flags ?? []) as FlagRow[]);
  }

  async function loadSettings() {
    const res = await fetch("/api/admin/games/settings", {
      credentials: "include",
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Settings failed (${res.status})`);
    const json = await res.json();
    setSettings(json.settings as Settings);
  }

  async function refreshAll() {
    if (!session) return;
    setError(null);
    try {
      await Promise.all([
        loadOverview(),
        loadPlayers(),
        loadSessions(),
        loadFinancials(),
        loadPuzzles(),
        loadFlags(),
        loadSettings(),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    getAdminSessionAsync().then((s) => {
      setSession(s);
      if (!s) setLoading(false);
    });
  }, []);

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadSessions().catch((e) => setError(e instanceof Error ? e.message : "Sessions failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionFilterMode, sessionFilterResult]);

  useEffect(() => {
    if (!session) return;
    loadOverview(overviewRange).catch((e) =>
      setError(e instanceof Error ? e.message : "Overview failed")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewRange]);

  useEffect(() => {
    if (!session) return;
    loadFinancials().catch((e) =>
      setError(e instanceof Error ? e.message : "Financials failed")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financialDateFrom, financialDateTo]);

  const filteredPlayers = useMemo(() => {
    const q = playersSearch.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) => p.email.toLowerCase().includes(q) || p.user_id.toLowerCase().includes(q)
    );
  }, [players, playersSearch]);

  async function banOrSuspendPlayer(playerId: string, status: "active" | "suspended" | "banned") {
    const reason =
      status === "active" ? "" : window.prompt(`Reason for ${status} this player?`) ?? "";
    try {
      const res = await fetch("/api/admin/games/ban", {
        method: "POST",
        credentials: "include",
        headers: {
          ...headers(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ playerId, status, reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Failed (${res.status})`);
      }
      await loadPlayers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update player status");
    }
  }

  async function voidSessionAction(sessionId: string) {
    const reason = window.prompt("Reason for voiding this session?") ?? "";
    if (!reason.trim()) return;
    try {
      const res = await fetch("/api/admin/games/void", {
        method: "POST",
        credentials: "include",
        headers: {
          ...headers(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Failed (${res.status})`);
      }
      await Promise.all([loadSessions(), loadFlags(), loadFinancials(), loadOverview()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to void session");
    }
  }

  async function payoutAction(sessionId: string, action: "approve" | "reject") {
    const reason =
      action === "reject"
        ? window.prompt("Reason for rejecting this payout?") ?? ""
        : undefined;
    try {
      const res = await fetch("/api/admin/games/sessions", {
        method: "POST",
        credentials: "include",
        headers: {
          ...headers(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          action: action === "approve" ? "approve_payout" : "reject_payout",
          reason,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Failed (${res.status})`);
      }
      await Promise.all([loadFinancials(), loadSessions()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update payout");
    }
  }

  async function reviewFlagAction(flagId: string, verdict: "legit" | "cheated" | "voided") {
    const notes = window.prompt(`Notes for ${verdict}?`) ?? "";
    try {
      const res = await fetch("/api/admin/games/flags", {
        method: "PATCH",
        credentials: "include",
        headers: {
          ...headers(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ flagId, verdict, notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Failed (${res.status})`);
      }
      await loadFlags();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to review flag");
    }
  }

  async function createPuzzle() {
    const payload = {
      ...newPuzzle,
      correct_pin: newPuzzle.correct_pin.replace(/\D/g, "").slice(0, 4),
    };
    try {
      const res = await fetch("/api/admin/games/puzzles", {
        method: "POST",
        credentials: "include",
        headers: {
          ...headers(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Failed (${res.status})`);
      }
      setNewPuzzle((prev) => ({
        ...prev,
        puzzle_name: "",
        clue_transaction_id: "",
        clue_formula: "",
        clue_terminal_text: "",
        clue_cabinet_text: "",
        correct_pin: "",
        preview_text: "",
      }));
      await loadPuzzles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save puzzle");
    }
  }

  async function togglePuzzle(puzzle: Puzzle, isActive: boolean) {
    try {
      const res = await fetch("/api/admin/games/puzzles", {
        method: "POST",
        credentials: "include",
        headers: {
          ...headers(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: puzzle.id,
          puzzle_name: puzzle.puzzle_name,
          clue_transaction_id: puzzle.clue_transaction_id,
          clue_formula: puzzle.clue_formula,
          clue_terminal_text: puzzle.clue_terminal_text,
          clue_cabinet_text: puzzle.clue_cabinet_text,
          correct_pin: puzzle.correct_pin,
          difficulty_level: puzzle.difficulty_level,
          active_date: puzzle.active_date,
          is_active: isActive,
          preview_text: puzzle.preview_text,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Failed (${res.status})`);
      }
      await loadPuzzles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update puzzle");
    }
  }

  async function saveSettings() {
    if (!settings) return;
    try {
      const res = await fetch("/api/admin/games/settings", {
        method: "PATCH",
        credentials: "include",
        headers: {
          ...headers(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Failed (${res.status})`);
      }
      const json = await res.json();
      setSettings(json.settings as Settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    }
  }

  function exportSessionsCsv() {
    if (!sessions.length) return;
    const cols = [
      "session_id",
      "player_id",
      "mode",
      "stake_cents",
      "start_time",
      "end_time",
      "escape_time_seconds",
      "result",
      "payout_cents",
      "payout_status",
      "suspicious",
    ];
    const rows = sessions.map((s) =>
      [
        s.id,
        s.player_id,
        s.mode,
        s.stake_cents,
        s.started_at,
        s.ended_at ?? "",
        s.escape_time_seconds ?? "",
        s.result,
        s.payout_cents,
        s.payout_status,
        s.suspicious ? "yes" : "no",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = `${cols.join(",")}\n${rows.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `escape-room-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!session) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5 text-[#9ca3af]">
          {loading ? "Loading admin session…" : "Redirecting to admin login…"}
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 flex flex-col gap-6">
      <header className="rounded-xl bg-[#111827] border border-white/10 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Stake & Escape Admin</h1>
            <p className="text-sm text-[#9ca3af]">
              Real-time operations, anti-cheat, payout controls, and puzzle scheduling.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refreshAll()}
            className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-[#2563eb] text-white"
                  : "bg-white/5 text-[#9ca3af] hover:text-white hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {tab === "overview" && (
        <section className="rounded-xl bg-[#111827] border border-white/10 p-5">
          {!stats ? (
            <p className="text-[#9ca3af] text-sm">Loading overview…</p>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {(["daily", "weekly", "monthly"] as const).map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => {
                      setOverviewRange(range);
                      loadOverview(range).catch((e) =>
                        setError(e instanceof Error ? e.message : "Failed to load overview range")
                      );
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium ${
                      overviewRange === range
                        ? "bg-[#2563eb] text-white"
                        : "bg-white/5 text-[#9ca3af] hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {range[0].toUpperCase() + range.slice(1)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Players online</p>
                  <p className="text-2xl font-bold text-white">{stats.playersOnline}</p>
                </div>
                <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Games played</p>
                  <p className="text-2xl font-bold text-white">{stats.totalGamesPlayed}</p>
                </div>
                <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Members played</p>
                  <p className="text-2xl font-bold text-white">{stats.totalMembersPlayed}</p>
                </div>
                <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Prize pool today</p>
                  <p className="text-2xl font-bold text-amber-300">{cents(stats.totalPrizePoolCents)}</p>
                </div>
                <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Platform revenue</p>
                  <p className="text-2xl font-bold text-emerald-400">{cents(stats.totalRevenueCents)}</p>
                </div>
                <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Payouts made</p>
                  <p className="text-2xl font-bold text-white">{cents(stats.totalPayoutsCents)}</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                  <p className="text-sm text-[#9ca3af]">Average escape time</p>
                  <p className="text-xl font-semibold text-white">
                    {compactSeconds(stats.avgEscapeTimeSeconds)}
                  </p>
                </div>
                <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                  <p className="text-sm text-[#9ca3af]">Success rate</p>
                  <p className="text-xl font-semibold text-white">
                    {stats.escapeSuccessRatePercent.toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                <h3 className="text-sm font-semibold text-white mb-2">Revenue trend</h3>
                <div className="space-y-2">
                  {stats.revenueSeries.slice(-10).map((row) => (
                    <div key={row.day} className="flex items-center gap-3">
                      <span className="text-xs text-[#9ca3af] w-24 shrink-0">{row.day}</span>
                      <div
                        className="h-2 rounded bg-emerald-500/70"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(4, stats.totalRevenueCents > 0 ? (row.fee / stats.totalRevenueCents) * 100 : 4)
                          )}%`,
                        }}
                      />
                      <span className="text-xs text-white">{cents(row.fee)}</span>
                    </div>
                  ))}
                  {stats.revenueSeries.length === 0 && (
                    <p className="text-[#6b7280] text-sm">No revenue data yet.</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                <h3 className="text-sm font-semibold text-white mb-2">Active sessions</h3>
                <AdminScrollHint />
                <AdminTableWrap>
                  <table className="w-full text-left text-sm min-w-[640px]">
                    <thead>
                      <tr className="border-b border-white/10 text-[#9ca3af]">
                        <th className="py-2 pr-3">Session</th>
                        <th className="py-2 pr-3">Player</th>
                        <th className="py-2 pr-3">Mode</th>
                        <th className="py-2 pr-3">Stake</th>
                        <th className="py-2 pr-3">Elapsed</th>
                        <th className="py-2 pr-3">Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.activeSessions.map((s) => (
                        <tr key={s.id} className="border-b border-white/5">
                          <td className="py-2 pr-3 text-white">{s.id.slice(0, 8)}…</td>
                          <td className="py-2 pr-3 text-white">{s.email}</td>
                          <td className="py-2 pr-3 text-[#9ca3af] uppercase">{s.mode}</td>
                          <td className="py-2 pr-3 text-white">{cents(s.stake_cents)}</td>
                          <td className="py-2 pr-3 text-white">{compactSeconds(s.elapsed_seconds)}</td>
                          <td className="py-2 pr-3 text-[#9ca3af]">
                            {new Date(s.started_at).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                      {stats.activeSessions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-[#6b7280]">
                            No active game sessions.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </AdminTableWrap>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "players" && (
        <section className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-white">Member management</h2>
            <input
              value={playersSearch}
              onChange={(e) => setPlayersSearch(e.target.value)}
              placeholder="Search name/email/user id"
              className="w-full md:w-72 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[#2563eb]"
            />
          </div>
          <AdminScrollHint />
          <AdminTableWrap>
            <table className="w-full text-left text-sm min-w-[980px]">
              <thead>
                <tr className="border-b border-white/10 text-[#9ca3af]">
                  <th className="py-2 pr-3">Member</th>
                  <th className="py-2 pr-3">Games</th>
                  <th className="py-2 pr-3">Staked</th>
                  <th className="py-2 pr-3">Won</th>
                  <th className="py-2 pr-3">Lost</th>
                  <th className="py-2 pr-3">Win Rate</th>
                  <th className="py-2 pr-3">Last Played</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((p) => (
                  <tr key={p.user_id} className="border-b border-white/5">
                    <td className="py-2 pr-3">
                      <p className="text-white truncate max-w-[220px]">{p.email}</p>
                      <p className="text-[11px] text-[#6b7280]">{p.user_id.slice(0, 8)}…</p>
                    </td>
                    <td className="py-2 pr-3 text-white">{p.games_played}</td>
                    <td className="py-2 pr-3 text-white">{cents(p.total_staked_cents)}</td>
                    <td className="py-2 pr-3 text-emerald-400">{cents(p.total_won_cents)}</td>
                    <td className="py-2 pr-3 text-amber-300">{cents(p.total_lost_cents)}</td>
                    <td className="py-2 pr-3 text-white">{p.win_rate_percent.toFixed(1)}%</td>
                    <td className="py-2 pr-3 text-[#9ca3af]">
                      {p.last_played_at ? new Date(p.last_played_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          p.status === "active"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : p.status === "suspended"
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {p.status}
                      </span>
                      {p.flagged_suspicious && (
                        <span className="ml-2 px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-300">
                          flagged
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedPlayer(p)}
                          className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                        >
                          History
                        </button>
                        <button
                          type="button"
                          onClick={() => banOrSuspendPlayer(p.user_id, "suspended")}
                          className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                        >
                          Suspend
                        </button>
                        <button
                          type="button"
                          onClick={() => banOrSuspendPlayer(p.user_id, "banned")}
                          className="px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                        >
                          Ban
                        </button>
                        <button
                          type="button"
                          onClick={() => banOrSuspendPlayer(p.user_id, "active")}
                          className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                        >
                          Restore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPlayers.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-4 text-center text-[#6b7280]">
                      No players found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </AdminTableWrap>
        </section>
      )}

      {tab === "sessions" && (
        <section className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-white">Session log</h2>
            <div className="flex flex-wrap gap-2">
              <select
                value={sessionFilterMode}
                onChange={(e) =>
                  setSessionFilterMode(e.target.value as "all" | "free" | "stake")
                }
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              >
                <option value="all">All modes</option>
                <option value="free">Free Play</option>
                <option value="stake">Stake Mode</option>
              </select>
              <select
                value={sessionFilterResult}
                onChange={(e) =>
                  setSessionFilterResult(
                    e.target.value as "all" | "active" | "win" | "lose" | "timeout" | "voided"
                  )
                }
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              >
                <option value="all">All results</option>
                <option value="active">Active</option>
                <option value="win">Win</option>
                <option value="lose">Lose</option>
                <option value="timeout">Timeout</option>
                <option value="voided">Voided</option>
              </select>
              <button
                type="button"
                onClick={exportSessionsCsv}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
              >
                Export CSV
              </button>
            </div>
          </div>

          <AdminScrollHint />
          <AdminTableWrap>
            <table className="w-full text-left text-sm min-w-[1080px]">
              <thead>
                <tr className="border-b border-white/10 text-[#9ca3af]">
                  <th className="py-2 pr-3">Session</th>
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3">Stake</th>
                  <th className="py-2 pr-3">Start</th>
                  <th className="py-2 pr-3">End</th>
                  <th className="py-2 pr-3">Escape</th>
                  <th className="py-2 pr-3">Result</th>
                  <th className="py-2 pr-3">Payout</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-white">{s.id.slice(0, 8)}…</td>
                    <td className="py-2 pr-3 text-[#9ca3af]">{s.player_id.slice(0, 8)}…</td>
                    <td className="py-2 pr-3 text-white uppercase">{s.mode}</td>
                    <td className="py-2 pr-3 text-white">{cents(s.stake_cents)}</td>
                    <td className="py-2 pr-3 text-[#9ca3af]">
                      {new Date(s.started_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-[#9ca3af]">
                      {s.ended_at ? new Date(s.ended_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-3 text-white">
                      {typeof s.escape_time_seconds === "number"
                        ? compactSeconds(s.escape_time_seconds)
                        : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          s.result === "win"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : s.result === "timeout"
                            ? "bg-amber-500/20 text-amber-300"
                            : s.result === "voided"
                            ? "bg-red-500/20 text-red-300"
                            : "bg-white/10 text-white"
                        }`}
                      >
                        {s.result}
                      </span>
                      {s.suspicious && (
                        <span className="ml-2 px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-300">
                          suspicious
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-white">{cents(s.payout_cents || 0)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => loadSessionReplay(s.id)}
                          className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                        >
                          Replay
                        </button>
                        <button
                          type="button"
                          onClick={() => voidSessionAction(s.id)}
                          className="px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                        >
                          Void
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-4 text-center text-[#6b7280]">
                      No sessions in this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </AdminTableWrap>

          {selectedReplay && (
            <div className="mt-4 rounded-lg bg-[#0b1220] border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">
                  Replay metadata · Session {selectedReplay.session?.id?.slice(0, 8) ?? "—"}…
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSessionId(null);
                    setSelectedReplay(null);
                  }}
                  className="px-2 py-1 rounded bg-white/10 text-white hover:bg-white/20 text-xs"
                >
                  Close
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded bg-black/20 border border-white/5 p-3">
                  <p className="text-[#9ca3af]">Result</p>
                  <p className="text-white">{selectedReplay.session?.result ?? "—"}</p>
                </div>
                <div className="rounded bg-black/20 border border-white/5 p-3">
                  <p className="text-[#9ca3af]">Server elapsed</p>
                  <p className="text-white">
                    {typeof selectedReplay.session?.server_elapsed_seconds === "number"
                      ? compactSeconds(selectedReplay.session.server_elapsed_seconds)
                      : "—"}
                  </p>
                </div>
              </div>
              <AdminScrollHint />
              <AdminTableWrap>
                <table className="w-full text-left text-sm min-w-[680px]">
                  <thead>
                    <tr className="border-b border-white/10 text-[#9ca3af]">
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Event</th>
                      <th className="py-2 pr-3">Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReplay.timerLogs.map((log) => (
                      <tr key={log.id} className="border-b border-white/5 align-top">
                        <td className="py-2 pr-3 text-[#9ca3af]">
                          {new Date(log.server_time).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-white">{log.event_type}</td>
                        <td className="py-2 pr-3 text-[#9ca3af] whitespace-pre-wrap break-all text-xs">
                          {JSON.stringify(log.payload)}
                        </td>
                      </tr>
                    ))}
                    {selectedReplay.timerLogs.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-3 text-center text-[#6b7280]">
                          No timer logs captured.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </AdminTableWrap>
            </div>
          )}
        </section>
      )}

      {tab === "financials" && (
        <section className="rounded-xl bg-[#111827] border border-white/10 p-5 space-y-6">
          <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Filter financial range</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="date"
                value={financialDateFrom}
                onChange={(e) => setFinancialDateFrom(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
              <input
                type="date"
                value={financialDateTo}
                onChange={(e) => setFinancialDateTo(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
              <button
                type="button"
                onClick={() => {
                  loadFinancials().catch((e) =>
                    setError(e instanceof Error ? e.message : "Failed to load financials")
                  );
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
              >
                Apply Date Filter
              </button>
            </div>
          </div>
          {!financials ? (
            <p className="text-[#9ca3af] text-sm">Loading financial data…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                  <p className="text-xs uppercase text-[#9ca3af]">All-time stake volume</p>
                  <p className="text-xl font-semibold text-white">{cents(financials.totalStakedCents)}</p>
                </div>
                <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                  <p className="text-xs uppercase text-[#9ca3af]">Platform revenue</p>
                  <p className="text-xl font-semibold text-emerald-400">{cents(financials.totalRevenueCents)}</p>
                </div>
                <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                  <p className="text-xs uppercase text-[#9ca3af]">Payouts paid</p>
                  <p className="text-xl font-semibold text-white">{cents(financials.totalPaidCents)}</p>
                </div>
              </div>

              <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                <h3 className="text-sm font-semibold text-white mb-2">Pending payouts queue</h3>
                <AdminScrollHint />
                <AdminTableWrap>
                  <table className="w-full text-left text-sm min-w-[840px]">
                    <thead>
                      <tr className="border-b border-white/10 text-[#9ca3af]">
                        <th className="py-2 pr-3">Payout ID</th>
                        <th className="py-2 pr-3">Session</th>
                        <th className="py-2 pr-3">Player</th>
                        <th className="py-2 pr-3">Amount</th>
                        <th className="py-2 pr-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financials.pendingPayouts.map((p) => (
                        <tr key={p.id} className="border-b border-white/5">
                          <td className="py-2 pr-3 text-white">{p.id.slice(0, 8)}…</td>
                          <td className="py-2 pr-3 text-[#9ca3af]">{p.session_id.slice(0, 8)}…</td>
                          <td className="py-2 pr-3 text-[#9ca3af]">{p.player_id.slice(0, 8)}…</td>
                          <td className="py-2 pr-3 text-white">{cents(p.amount_cents)}</td>
                          <td className="py-2 pr-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => payoutAction(p.session_id, "approve")}
                                className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => payoutAction(p.session_id, "reject")}
                                className="px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {financials.pendingPayouts.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-[#6b7280]">
                            No pending payouts.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </AdminTableWrap>
              </div>

              <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
                <h3 className="text-sm font-semibold text-white mb-2">Daily revenue breakdown</h3>
                <div className="space-y-2">
                  {financials.dailyRevenue.slice(-14).map((d) => (
                    <div key={d.day} className="flex items-center justify-between rounded bg-black/20 px-3 py-2">
                      <span className="text-[#9ca3af] text-sm">{d.day}</span>
                      <div className="flex gap-4 text-sm">
                        <span className="text-white">Staked {cents(d.staked)}</span>
                        <span className="text-emerald-400">Revenue {cents(d.revenue)}</span>
                        <span className="text-amber-300">Paid {cents(d.paid)}</span>
                      </div>
                    </div>
                  ))}
                  {financials.dailyRevenue.length === 0 && (
                    <p className="text-[#6b7280] text-sm">No daily breakdown yet.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "puzzles" && (
        <section className="rounded-xl bg-[#111827] border border-white/10 p-5 space-y-6">
          <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Create or schedule puzzle</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <input
                value={newPuzzle.puzzle_name}
                onChange={(e) => setNewPuzzle((p) => ({ ...p, puzzle_name: e.target.value }))}
                placeholder="Puzzle name"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
              <input
                value={newPuzzle.active_date}
                onChange={(e) => setNewPuzzle((p) => ({ ...p, active_date: e.target.value }))}
                type="date"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
              <input
                value={newPuzzle.clue_transaction_id}
                onChange={(e) =>
                  setNewPuzzle((p) => ({ ...p, clue_transaction_id: e.target.value }))
                }
                placeholder="Transaction ID clue"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
              <input
                value={newPuzzle.correct_pin}
                onChange={(e) =>
                  setNewPuzzle((p) => ({
                    ...p,
                    correct_pin: e.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
                placeholder="Correct PIN (4 digits)"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
              <textarea
                value={newPuzzle.clue_formula}
                onChange={(e) => setNewPuzzle((p) => ({ ...p, clue_formula: e.target.value }))}
                placeholder="Formula clue"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white md:col-span-2 min-h-[72px]"
              />
              <textarea
                value={newPuzzle.clue_terminal_text}
                onChange={(e) =>
                  setNewPuzzle((p) => ({ ...p, clue_terminal_text: e.target.value }))
                }
                placeholder="Terminal clue text"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white min-h-[72px]"
              />
              <textarea
                value={newPuzzle.clue_cabinet_text}
                onChange={(e) =>
                  setNewPuzzle((p) => ({ ...p, clue_cabinet_text: e.target.value }))
                }
                placeholder="Filing cabinet clue text"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white min-h-[72px]"
              />
              <select
                value={newPuzzle.difficulty_level}
                onChange={(e) =>
                  setNewPuzzle((p) => ({
                    ...p,
                    difficulty_level: e.target.value as "easy" | "medium" | "hard" | "expert",
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="expert">Expert</option>
              </select>
              <input
                value={newPuzzle.preview_text}
                onChange={(e) => setNewPuzzle((p) => ({ ...p, preview_text: e.target.value }))}
                placeholder="Preview text"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={createPuzzle}
                className="px-4 py-2 rounded-lg bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
              >
                Save puzzle
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-[#0b1220] border border-white/10 p-4">
            <h3 className="text-sm font-semibold text-white mb-2">Puzzle calendar/history</h3>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full text-left text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-white/10 text-[#9ca3af]">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Difficulty</th>
                    <th className="py-2 pr-3">Preview</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {puzzles.map((p) => (
                    <tr key={p.id} className="border-b border-white/5">
                      <td className="py-2 pr-3 text-white">{p.active_date}</td>
                      <td className="py-2 pr-3 text-white">{p.puzzle_name}</td>
                      <td className="py-2 pr-3 text-[#9ca3af]">{p.difficulty_level}</td>
                      <td className="py-2 pr-3 text-[#9ca3af]">{p.preview_text ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            p.is_active
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-white/10 text-[#9ca3af]"
                          }`}
                        >
                          {p.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => togglePuzzle(p, !p.is_active)}
                          className="px-2 py-1 rounded bg-white/10 text-white hover:bg-white/20"
                        >
                          {p.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {puzzles.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-[#6b7280]">
                        No puzzles created yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </AdminTableWrap>
          </div>
        </section>
      )}

      {tab === "antiCheat" && (
        <section className="rounded-xl bg-[#111827] border border-white/10 p-5 space-y-4">
          <h2 className="text-lg font-semibold text-white">Flag review queue</h2>
          <AdminScrollHint />
          <AdminTableWrap>
            <table className="w-full text-left text-sm min-w-[920px]">
              <thead>
                <tr className="border-b border-white/10 text-[#9ca3af]">
                  <th className="py-2 pr-3">Flag</th>
                  <th className="py-2 pr-3">Session</th>
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <tr key={f.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-white">{f.id.slice(0, 8)}…</td>
                    <td className="py-2 pr-3 text-[#9ca3af]">{f.session_id.slice(0, 8)}…</td>
                    <td className="py-2 pr-3 text-[#9ca3af]">{f.player_id.slice(0, 8)}…</td>
                    <td className="py-2 pr-3 text-white">{f.flag_type}</td>
                    <td className="py-2 pr-3 text-[#9ca3af]">{f.reason}</td>
                    <td className="py-2 pr-3">
                      <span className="px-2 py-1 rounded text-xs bg-white/10 text-white">
                        {f.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => reviewFlagAction(f.id, "legit")}
                          className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                        >
                          Legit
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewFlagAction(f.id, "cheated")}
                          className="px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                        >
                          Cheated
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewFlagAction(f.id, "voided")}
                          className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                        >
                          Void
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {flags.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-[#6b7280]">
                      No anti-cheat flags currently.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </AdminTableWrap>
        </section>
      )}

      {tab === "settings" && (
        <section className="rounded-xl bg-[#111827] border border-white/10 p-5">
          {!settings ? (
            <p className="text-[#9ca3af] text-sm">Loading settings…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <label className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white flex items-center justify-between">
                  <span>Free Play enabled</span>
                  <input
                    type="checkbox"
                    checked={settings.free_play_enabled}
                    onChange={(e) =>
                      setSettings((s) => (s ? { ...s, free_play_enabled: e.target.checked } : s))
                    }
                  />
                </label>
                <label className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white flex items-center justify-between">
                  <span>Stake Mode enabled</span>
                  <input
                    type="checkbox"
                    checked={settings.stake_mode_enabled}
                    onChange={(e) =>
                      setSettings((s) => (s ? { ...s, stake_mode_enabled: e.target.checked } : s))
                    }
                  />
                </label>
                <label className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
                  <span className="block text-[#9ca3af] mb-1">Min stake ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={(settings.min_stake_cents / 100).toFixed(2)}
                    onChange={(e) =>
                      setSettings((s) =>
                        s
                          ? { ...s, min_stake_cents: Math.max(0, Math.round(Number(e.target.value || 0) * 100)) }
                          : s
                      )
                    }
                    className="w-full rounded border border-white/10 bg-black/20 px-2 py-1"
                  />
                </label>
                <label className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
                  <span className="block text-[#9ca3af] mb-1">Max stake ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={(settings.max_stake_cents / 100).toFixed(2)}
                    onChange={(e) =>
                      setSettings((s) =>
                        s
                          ? { ...s, max_stake_cents: Math.max(0, Math.round(Number(e.target.value || 0) * 100)) }
                          : s
                      )
                    }
                    className="w-full rounded border border-white/10 bg-black/20 px-2 py-1"
                  />
                </label>
                <label className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
                  <span className="block text-[#9ca3af] mb-1">Platform fee (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={settings.platform_fee_percent}
                    onChange={(e) =>
                      setSettings((s) =>
                        s ? { ...s, platform_fee_percent: Number(e.target.value || 0) } : s
                      )
                    }
                    className="w-full rounded border border-white/10 bg-black/20 px-2 py-1"
                  />
                </label>
                <label className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
                  <span className="block text-[#9ca3af] mb-1">Countdown (seconds)</span>
                  <input
                    type="number"
                    value={settings.countdown_seconds}
                    onChange={(e) =>
                      setSettings((s) =>
                        s ? { ...s, countdown_seconds: Math.max(60, Math.floor(Number(e.target.value || 0))) } : s
                      )
                    }
                    className="w-full rounded border border-white/10 bg-black/20 px-2 py-1"
                  />
                </label>
                <label className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
                  <span className="block text-[#9ca3af] mb-1">Top1 split (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={settings.top1_split_percent}
                    onChange={(e) =>
                      setSettings((s) =>
                        s ? { ...s, top1_split_percent: Number(e.target.value || 0) } : s
                      )
                    }
                    className="w-full rounded border border-white/10 bg-black/20 px-2 py-1"
                  />
                </label>
                <label className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
                  <span className="block text-[#9ca3af] mb-1">Top2 split (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={settings.top2_split_percent}
                    onChange={(e) =>
                      setSettings((s) =>
                        s ? { ...s, top2_split_percent: Number(e.target.value || 0) } : s
                      )
                    }
                    className="w-full rounded border border-white/10 bg-black/20 px-2 py-1"
                  />
                </label>
                <label className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
                  <span className="block text-[#9ca3af] mb-1">Top3 split (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={settings.top3_split_percent}
                    onChange={(e) =>
                      setSettings((s) =>
                        s ? { ...s, top3_split_percent: Number(e.target.value || 0) } : s
                      )
                    }
                    className="w-full rounded border border-white/10 bg-black/20 px-2 py-1"
                  />
                </label>
                <label className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white md:col-span-2">
                  <span className="block text-[#9ca3af] mb-1">Maintenance banner</span>
                  <input
                    value={settings.maintenance_banner ?? ""}
                    onChange={(e) =>
                      setSettings((s) =>
                        s
                          ? {
                              ...s,
                              maintenance_banner: e.target.value.trim()
                                ? e.target.value
                                : null,
                            }
                          : s
                      )
                    }
                    className="w-full rounded border border-white/10 bg-black/20 px-2 py-1"
                    placeholder="Optional lobby maintenance message"
                  />
                </label>
              </div>
              <div>
                <button
                  type="button"
                  onClick={saveSettings}
                  className="px-4 py-2 rounded-lg bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                >
                  Save settings
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
