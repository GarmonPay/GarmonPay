"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = getApiRoot();

type AuditPayload = {
  checkedAt: string;
  room_id: string;
  traces: unknown[];
  room_bank: unknown;
};

export default function AdminCeloAuditPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [roomId, setRoomId] = useState("");
  const [roundId, setRoundId] = useState("");
  const [limit, setLimit] = useState("8");
  const [data, setData] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  const run = useCallback(async () => {
    if (!session) return;
    const rid = roomId.trim();
    if (!rid) {
      setError("Enter a room UUID");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ roomId: rid, limit: limit || "8" });
      const ro = roundId.trim();
      if (ro) q.set("roundId", ro);
      const res = await fetch(`${API_BASE}/admin/celo/audit?${q}`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setData(j as AuditPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [session, roomId, roundId, limit]);

  return (
    <div className="max-w-5xl text-white">
      <h1 className="text-2xl font-bold mb-1">C-Lo accounting audit</h1>
      <p className="text-fintech-muted text-sm mb-6">
        Staging verification: per-round ledger traces, idempotency refs, and consistency checks (read-only).
        Set <code className="text-amber-200/90">CELO_ACCOUNTING_AUDIT_LOG=1</code> on the server for operator
        settlement logs.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end mb-4">
        <label className="flex flex-col gap-1 text-sm min-w-[200px]">
          Room ID
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="celo_rooms.id"
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm min-w-[200px]">
          Round ID (optional)
          <input
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            placeholder="single round"
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm w-24">
          Limit
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={!session || loading}
          onClick={() => void run()}
          className="rounded-lg bg-amber-500/90 text-black font-semibold px-4 py-2 text-sm disabled:opacity-40"
        >
          {loading ? "Loading…" : "Run audit"}
        </button>
      </div>

      {!session && <p className="text-fintech-muted text-sm">Loading admin session…</p>}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200 mb-4">
          {error}
        </div>
      )}

      {data && (
        <pre className="text-xs overflow-auto max-h-[70vh] rounded-xl border border-white/10 bg-black/50 p-4 text-emerald-100/90">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
