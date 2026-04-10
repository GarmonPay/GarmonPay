"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = getApiRoot();

type CeloRoomRow = {
  id: string;
  name: string;
  status: string;
  banker_id: string;
  banker_email: string | null;
  player_count: number;
  bank_amount_cents: number;
  created_at: string | null;
};

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

export default function AdminCeloRoomsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [rooms, setRooms] = useState<CeloRoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async (s: AdminSession) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/celo/rooms`, {
        credentials: "include",
        headers: adminApiHeaders(s),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load rooms");
      setRooms((data.rooms ?? []) as CeloRoomRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    void load(session);
  }, [session, load]);

  async function forceClose(roomId: string) {
    if (!session) return;
    setPendingId(roomId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/celo/rooms`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...adminApiHeaders(session) },
        body: JSON.stringify({ roomId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Force close failed");
      setConfirmId(null);
      await load(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Force close failed");
    } finally {
      setPendingId(null);
    }
  }

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-fintech-muted">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-2">C-Lo Rooms</h1>
      <p className="text-fintech-muted mb-6">
        All street dice rooms: status, banker, seated count, bank, and admin force-close (refunds + cancelled).
      </p>

      {error && (
        <div className="rounded-lg bg-red-500/20 text-red-400 p-4 mb-4" role="alert">
          {error}
        </div>
      )}

      {loading && rooms.length === 0 ? (
        <p className="text-fintech-muted">Loading…</p>
      ) : (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-3 text-sm font-medium text-fintech-muted">Room</th>
                <th className="p-3 text-sm font-medium text-fintech-muted">Status</th>
                <th className="p-3 text-sm font-medium text-fintech-muted">Banker</th>
                <th className="p-3 text-sm font-medium text-fintech-muted">Players</th>
                <th className="p-3 text-sm font-medium text-fintech-muted">Bank</th>
                <th className="p-3 text-sm font-medium text-fintech-muted">Created</th>
                <th className="p-3 text-sm font-medium text-fintech-muted w-[140px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id} className="border-b border-white/5">
                  <td className="p-3 text-white text-sm font-mono">{r.name || r.id.slice(0, 8)}</td>
                  <td className="p-3 text-white text-sm">{r.status}</td>
                  <td className="p-3 text-fintech-muted text-sm">{r.banker_email ?? r.banker_id.slice(0, 8)}</td>
                  <td className="p-3 text-white text-sm">{r.player_count}</td>
                  <td className="p-3 text-white text-sm">{formatCents(r.bank_amount_cents)}</td>
                  <td className="p-3 text-fintech-muted text-sm">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-3">
                    {r.status !== "cancelled" && r.status !== "completed" ? (
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
                        disabled={pendingId === r.id}
                        onClick={() => setConfirmId(r.id)}
                      >
                        {pendingId === r.id ? "…" : "Force Close"}
                      </button>
                    ) : (
                      <span className="text-fintech-muted text-sm">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rooms.length === 0 && (
            <p className="p-4 text-fintech-muted text-sm">No C-Lo rooms found.</p>
          )}
        </div>
      )}

      {confirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="force-close-title"
        >
          <div className="bg-fintech-bg-card border border-white/10 rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 id="force-close-title" className="text-lg font-bold text-white mb-2">
              Force close room?
            </h2>
            <p className="text-fintech-muted text-sm mb-6">
              This refunds all player stakes and the banker deposit, deletes in-progress rounds, and sets the room to
              cancelled. This uses the same idempotent ledger references as normal close/cleanup.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-medium text-fintech-muted hover:text-white hover:bg-white/5"
                onClick={() => setConfirmId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30"
                onClick={() => void forceClose(confirmId)}
              >
                Force Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
