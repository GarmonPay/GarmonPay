"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function AdminBoxingPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getAdminSessionAsync>>>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [liveMatches, setLiveMatches] = useState<Array<{ id: string; status: string; entry_fee: number }>>([]);
  const [fighters, setFighters] = useState<
    Array<{
      id: string;
      user_id: string;
      email: string;
      banned: boolean;
      name: string;
      speed: number;
      power: number;
      defense: number;
      stamina: number;
      wins: number;
      losses: number;
      level: number;
      experience: number;
    }>
  >([]);
  const [tournaments, setTournaments] = useState<Array<{ id: string; name: string; entry_fee: number; prize_pool: number; status: string }>>([]);
  const [banReason, setBanReason] = useState("");
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [newTournament, setNewTournament] = useState({
    name: "",
    entry_fee: "2.5",
    prize_pool: "0",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  const refresh = useCallback(async (activeSession: NonNullable<typeof session>) => {
    setLoading(true);
    setError(null);
    try {
      const headers = adminApiHeaders(activeSession);
      const [revenueRes, fightsRes, fightersRes, tournamentsRes] = await Promise.all([
        fetch(`${API_BASE}/admin/boxing/revenue`, { headers }),
        fetch(`${API_BASE}/boxing/live-matches`, { headers }),
        fetch(`${API_BASE}/admin/boxing/fighters?limit=80`, { headers }),
        fetch(`${API_BASE}/admin/tournaments`, { headers }),
      ]);
      const revenueJson = revenueRes.ok ? await revenueRes.json() : { revenue: 0 };
      const fightsJson = fightsRes.ok ? await fightsRes.json() : { matches: [] };
      const fightersJson = fightersRes.ok ? await fightersRes.json() : { fighters: [] };
      const tournamentsJson = tournamentsRes.ok ? await tournamentsRes.json() : { tournaments: [] };
      setRevenue(typeof revenueJson.revenue === "number" ? revenueJson.revenue : 0);
      setLiveMatches(Array.isArray(fightsJson.matches) ? fightsJson.matches : []);
      setFighters(Array.isArray(fightersJson.fighters) ? fightersJson.fighters : []);
      setTournaments(Array.isArray(tournamentsJson.tournaments) ? tournamentsJson.tournaments : []);
    } catch {
      setError("Failed to load boxing admin data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void refresh(session);
  }, [session, refresh]);

  const updateFighter = async (fighterId: string, updates: Record<string, unknown>) => {
    if (!session) return;
    const res = await fetch(`${API_BASE}/admin/boxing/fighters`, {
      method: "PATCH",
      headers: {
        ...adminApiHeaders(session),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fighterId, ...updates }),
    });
    if (!res.ok) {
      setError("Failed to update fighter.");
      return;
    }
    await refresh(session);
  };

  const toggleBan = async (userId: string, banned: boolean) => {
    if (!session) return;
    const res = await fetch(`${API_BASE}/admin/ban`, {
      method: "POST",
      headers: {
        ...adminApiHeaders(session),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, banned, reason: banReason }),
    });
    if (!res.ok) {
      setError("Failed to update ban state.");
      return;
    }
    await refresh(session);
  };

  const createTournament = async () => {
    if (!session) return;
    if (!newTournament.name.trim()) {
      setError("Tournament name is required.");
      return;
    }
    setCreatingTournament(true);
    const now = new Date();
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const res = await fetch(`${API_BASE}/admin/tournaments`, {
      method: "POST",
      headers: {
        ...adminApiHeaders(session),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: newTournament.name.trim(),
        entry_fee: Number(newTournament.entry_fee || 0),
        prize_pool: Number(newTournament.prize_pool || 0),
        start_date: now.toISOString(),
        end_date: end.toISOString(),
      }),
    });
    setCreatingTournament(false);
    if (!res.ok) {
      setError("Failed to create tournament.");
      return;
    }
    setNewTournament({ name: "", entry_fee: "2.5", prize_pool: "0" });
    await refresh(session);
  };

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh] text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Boxing</h1>
      <p className="text-[#9ca3af] mb-6">
        Manage tournaments, monitor live fights, tune fighter stats, and ban cheaters.
      </p>
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/40 p-4 text-sm text-red-300 mb-6">
          {error}
        </div>
      )}

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">Boxing Revenue</h2>
        {loading ? (
          <p className="text-[#9ca3af]">Loading…</p>
        ) : (
          <p className="text-2xl font-bold text-[#10b981]">
            ${(revenue ?? 0).toFixed(2)}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Tournament Control</h2>
          <div className="space-y-2">
            <input
              value={newTournament.name}
              onChange={(e) => setNewTournament((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Tournament name"
              className="w-full rounded-lg bg-black/20 border border-white/20 px-3 py-2 text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={newTournament.entry_fee}
                onChange={(e) => setNewTournament((prev) => ({ ...prev, entry_fee: e.target.value }))}
                placeholder="Entry fee ($)"
                className="rounded-lg bg-black/20 border border-white/20 px-3 py-2 text-white"
              />
              <input
                value={newTournament.prize_pool}
                onChange={(e) => setNewTournament((prev) => ({ ...prev, prize_pool: e.target.value }))}
                placeholder="Initial prize ($)"
                className="rounded-lg bg-black/20 border border-white/20 px-3 py-2 text-white"
              />
            </div>
            <button
              type="button"
              onClick={createTournament}
              disabled={creatingTournament}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 font-semibold text-black"
            >
              {creatingTournament ? "Creating…" : "Create Tournament"}
            </button>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {tournaments.slice(0, 6).map((t) => (
              <li key={t.id} className="rounded-lg bg-black/20 px-3 py-2 text-[#9ca3af]">
                <span className="text-white font-medium">{t.name}</span> · ${Number(t.entry_fee).toFixed(2)} · {t.status}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Live Fight Monitor</h2>
          {loading ? (
            <p className="text-[#9ca3af]">Loading live fights…</p>
          ) : liveMatches.length === 0 ? (
            <p className="text-[#9ca3af] text-sm">No live or queued fights.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {liveMatches.slice(0, 12).map((m) => (
                <li key={m.id} className="rounded-lg bg-black/20 px-3 py-2 text-[#9ca3af]">
                  <span className="text-white font-medium">{m.id.slice(0, 8)}</span> · {m.status} · ${(Number(m.entry_fee) / 100).toFixed(2)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6 mt-6">
        <h2 className="text-lg font-semibold text-white mb-3">Fighter Stat Adjustment & Anti-Cheat</h2>
        <div className="mb-3 flex items-center gap-2">
          <input
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            placeholder="Ban reason"
            className="w-full max-w-sm rounded-lg bg-black/20 border border-white/20 px-3 py-2 text-white"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-[#9ca3af] border-b border-white/10">
                <th className="py-2 pr-2">Fighter</th>
                <th className="py-2 pr-2">User</th>
                <th className="py-2 pr-2">SPD</th>
                <th className="py-2 pr-2">PWR</th>
                <th className="py-2 pr-2">DEF</th>
                <th className="py-2 pr-2">STA</th>
                <th className="py-2 pr-2">EXP</th>
                <th className="py-2 pr-2">Record</th>
                <th className="py-2 pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fighters.slice(0, 30).map((f) => (
                <tr key={f.id} className="border-b border-white/5 text-[#9ca3af]">
                  <td className="py-2 pr-2 text-white">{f.name}</td>
                  <td className="py-2 pr-2">{f.email}</td>
                  <td className="py-2 pr-2">{f.speed}</td>
                  <td className="py-2 pr-2">{f.power}</td>
                  <td className="py-2 pr-2">{f.defense}</td>
                  <td className="py-2 pr-2">{f.stamina}</td>
                  <td className="py-2 pr-2">{f.experience}</td>
                  <td className="py-2 pr-2">
                    {f.wins}-{f.losses}
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => updateFighter(f.id, { speed: f.speed + 1 })}
                        className="rounded bg-white/10 px-2 py-1 text-xs text-white"
                      >
                        +SPD
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFighter(f.id, { power: f.power + 1 })}
                        className="rounded bg-white/10 px-2 py-1 text-xs text-white"
                      >
                        +PWR
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFighter(f.id, { defense: f.defense + 1 })}
                        className="rounded bg-white/10 px-2 py-1 text-xs text-white"
                      >
                        +DEF
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleBan(f.user_id, !f.banned)}
                        className={`rounded px-2 py-1 text-xs font-semibold ${f.banned ? "bg-emerald-500 text-black" : "bg-red-500 text-white"}`}
                      >
                        {f.banned ? "Unban" : "Ban"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
