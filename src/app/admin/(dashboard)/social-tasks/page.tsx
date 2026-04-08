"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Row = {
  id: string;
  task_id: string;
  user_id: string;
  proof_url: string | null;
  status: string;
  reward_cents: number;
  completed_at: string;
  task: {
    title?: string;
    platform?: string;
    task_type?: string;
    target_url?: string;
  } | null;
};

export default function AdminSocialTasksPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/social/pending?status=pending`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const data = (await res.json().catch(() => ({}))) as { completions?: Row[]; message?: string };
      if (!res.ok) {
        setError(data.message ?? "Failed to load");
        setItems([]);
      } else {
        setItems(data.completions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when admin session is ready
  }, [session?.adminId]);

  async function act(id: string, action: "approve" | "reject") {
    if (!session) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/social/approve`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...adminApiHeaders(session),
        },
        body: JSON.stringify({ completion_id: id, action }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Action failed");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="py-8 text-white max-w-4xl">
      <h1 className="text-xl font-bold text-white mb-2">Social tasks</h1>
      <p className="text-slate-400 text-sm mb-6">Review pending submissions and approve rewards.</p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">No pending completions.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-white/10 bg-fintech-bg-card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
            >
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-white">{row.task?.title ?? "Task"}</p>
                <p className="text-slate-400">
                  {row.task?.platform} · {row.task?.task_type} · ${(row.reward_cents / 100).toFixed(2)}
                </p>
                <p className="text-xs text-slate-500 font-mono">User: {row.user_id}</p>
                {row.proof_url && (
                  <a
                    href={row.proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-fintech-accent hover:underline text-xs break-all"
                  >
                    {row.proof_url}
                  </a>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => void act(row.id, "reject")}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => void act(row.id, "approve")}
                  className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white hover:bg-fintech-accent/90 disabled:opacity-50"
                >
                  {busy === row.id ? "…" : "Approve"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
