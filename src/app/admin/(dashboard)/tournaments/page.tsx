"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";
import { buildAdminAuthHeaders } from "@/lib/admin-request";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Tournament = {
  id: string;
  name: string;
  entry_fee: number;
  prize_pool: number;
  platform_profit?: number;
  reserve_balance?: number;
  start_date: string;
  end_date: string;
  status: string;
  created_at?: string;
};

export default function AdminTournamentsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    entry_fee: 0,
    prize_pool: 0,
    start_date: new Date().toISOString().slice(0, 16),
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  });

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  function loadTournaments() {
    if (!session) return;
    setLoading(true);
    fetch(`${API_BASE}/admin/tournaments`, { headers: buildAdminAuthHeaders(session) })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load tournaments");
        return res.json();
      })
      .then((data) => setTournaments(data.tournaments ?? []))
      .catch(() => setError("Failed to load tournaments"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (session) loadTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSuccess(null);
    if (!session) return;
    const payload = {
      name: form.name.trim(),
      entry_fee: Number(form.entry_fee) || 0,
      prize_pool: Number(form.prize_pool) || 0,
      start_date: new Date(form.start_date).toISOString(),
      end_date: new Date(form.end_date).toISOString(),
    };
    if (!payload.name) {
      setSubmitError("Name is required");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/admin/tournaments`, {
        method: "POST",
        headers: buildAdminAuthHeaders(session, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Create failed");
      setSuccess("Tournament created.");
      setForm({
        name: "",
        entry_fee: 0,
        prize_pool: 0,
        start_date: new Date().toISOString().slice(0, 16),
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      });
      loadTournaments();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function handleEnd(tournamentId: string) {
    if (!session || endingId) return;
    setSubmitError(null);
    setSuccess(null);
    setEndingId(tournamentId);
    try {
      const res = await fetch(`${API_BASE}/admin/tournaments/end`, {
        method: "POST",
        headers: buildAdminAuthHeaders(session, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ tournamentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "End failed");
      setSuccess("Tournament ended; prizes distributed (50% / 30% / 20%).");
      loadTournaments();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "End failed");
    } finally {
      setEndingId(null);
    }
  }

  const style = {
    page: { padding: "1.5rem", maxWidth: 960, color: "#e2e8f0" },
    title: { fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "#fff" },
    card: { background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "1.25rem", marginBottom: "1rem" },
    input: { width: "100%", padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "#1e293b", color: "#fff" },
    label: { display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#94a3b8" },
    button: { padding: "0.5rem 1rem", borderRadius: 8, fontWeight: 600, cursor: "pointer" as const },
    table: { width: "100%", borderCollapse: "collapse" as const },
    th: { textAlign: "left" as const, padding: "0.5rem 0.75rem", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: "0.75rem" },
    td: { padding: "0.5rem 0.75rem", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  };

  return (
    <div style={style.page}>
      <h1 style={style.title}>Tournaments</h1>
      <p style={{ marginBottom: "1rem", color: "#94a3b8", fontSize: "0.875rem" }}>
        Entry fee split: 60% prize pool, 30% platform profit, 10% reserve. Payouts only from prize pool; profit and reserve are locked.
      </p>
      {tournaments.length > 0 && (
        <div style={{ ...style.card, display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div>
            <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Total platform profit</span>
            <div style={{ color: "#86efac", fontWeight: 700, fontSize: "1.25rem" }}>
              ${tournaments.reduce((s, t) => s + Number(t.platform_profit ?? 0), 0).toFixed(2)}
            </div>
          </div>
          <div>
            <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Total reserve balance</span>
            <div style={{ color: "#93c5fd", fontWeight: 700, fontSize: "1.25rem" }}>
              ${tournaments.reduce((s, t) => s + Number(t.reserve_balance ?? 0), 0).toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ ...style.card, borderColor: "rgba(239,68,68,0.5)", marginBottom: "1rem" }}>
          <p style={{ color: "#fca5a5" }}>{error}</p>
        </div>
      )}
      {submitError && (
        <div style={{ ...style.card, borderColor: "rgba(239,68,68,0.5)", marginBottom: "1rem" }}>
          <p style={{ color: "#fca5a5" }}>{submitError}</p>
        </div>
      )}
      {success && (
        <div style={{ ...style.card, borderColor: "rgba(34,197,94,0.5)", marginBottom: "1rem" }}>
          <p style={{ color: "#86efac" }}>{success}</p>
        </div>
      )}

      <div style={style.card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem", color: "#fff" }}>Create tournament</h2>
        <form onSubmit={handleCreate} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", alignItems: "end" }}>
          <div>
            <label style={style.label}>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={style.input}
              placeholder="Tournament name"
            />
          </div>
          <div>
            <label style={style.label}>Entry fee ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.entry_fee || ""}
              onChange={(e) => setForm((f) => ({ ...f, entry_fee: Number(e.target.value) || 0 }))}
              style={style.input}
            />
          </div>
          <div>
            <label style={style.label}>Initial prize pool ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.prize_pool || ""}
              onChange={(e) => setForm((f) => ({ ...f, prize_pool: Number(e.target.value) || 0 }))}
              style={style.input}
            />
          </div>
          <div>
            <label style={style.label}>Start (local)</label>
            <input
              type="datetime-local"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              style={style.input}
            />
          </div>
          <div>
            <label style={style.label}>End (local)</label>
            <input
              type="datetime-local"
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              style={style.input}
            />
          </div>
          <div>
            <button type="submit" style={{ ...style.button, background: "#2563eb", color: "#fff", border: "none" }}>
              Create
            </button>
          </div>
        </form>
      </div>

      <div style={style.card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem", color: "#fff" }}>All tournaments</h2>
        {loading ? (
          <p style={{ color: "#94a3b8" }}>Loading…</p>
        ) : tournaments.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No tournaments yet.</p>
        ) : (
          <table style={style.table}>
            <thead>
              <tr>
                <th style={style.th}>Name</th>
                <th style={style.th}>Entry fee</th>
                <th style={style.th}>Prize pool</th>
                <th style={style.th}>Platform profit</th>
                <th style={style.th}>Reserve</th>
                <th style={style.th}>Start</th>
                <th style={style.th}>End</th>
                <th style={style.th}>Status</th>
                <th style={style.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t) => (
                <tr key={t.id}>
                  <td style={style.td}>{t.name}</td>
                  <td style={style.td}>${Number(t.entry_fee).toFixed(2)}</td>
                  <td style={style.td}>${Number(t.prize_pool).toFixed(2)}</td>
                  <td style={style.td}>${Number(t.platform_profit ?? 0).toFixed(2)}</td>
                  <td style={style.td}>${Number(t.reserve_balance ?? 0).toFixed(2)}</td>
                  <td style={style.td}>{new Date(t.start_date).toLocaleString()}</td>
                  <td style={style.td}>{new Date(t.end_date).toLocaleString()}</td>
                  <td style={style.td}>{t.status}</td>
                  <td style={style.td}>
                    {t.status !== "ended" && (
                      <button
                        type="button"
                        onClick={() => handleEnd(t.id)}
                        disabled={!!endingId}
                        style={{
                          ...style.button,
                          background: "transparent",
                          color: "#f87171",
                          border: "1px solid rgba(248,113,113,0.5)",
                        }}
                      >
                        {endingId === t.id ? "Ending…" : "End tournament"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
