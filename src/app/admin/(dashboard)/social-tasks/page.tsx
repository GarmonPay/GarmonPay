"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = getApiRoot();

const PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "facebook", "twitch"] as const;
const TIERS = ["free", "starter", "growth", "pro", "elite", "vip"] as const;

type Row = {
  id: string;
  task_id: string;
  user_id: string;
  proof_url: string | null;
  status: string;
  reward_gpc: number;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    platform: "instagram" as (typeof PLATFORMS)[number],
    task_type: "follow",
    reward_gpc: "50",
    min_tier: "free" as (typeof TIERS)[number],
    proof_required: true,
    target_url: "https://",
    max_completions: "500",
    status: "active" as "active" | "paused",
  });

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/social/pending?status=pending`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const data = (await res.json().catch(() => ({}))) as { completions?: Row[]; message?: string };
      if (!res.ok) {
        setLoadError(data.message ?? "Failed to load");
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
    setLoadError(null);
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
        setLoadError(data.message ?? "Action failed");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setCreateBusy(true);
    setCreateError(null);
    setCreateSuccess(null);
    const reward = Math.floor(Number(form.reward_gpc));
    const maxC = Math.floor(Number(form.max_completions));
    try {
      const res = await fetch(`${API_BASE}/admin/social/tasks`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...adminApiHeaders(session),
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          platform: form.platform,
          task_type: form.task_type.trim(),
          reward_gpc: reward,
          min_tier: form.min_tier,
          proof_required: form.proof_required,
          target_url: form.target_url.trim(),
          max_completions: maxC,
          status: form.status,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
      if (!res.ok) {
        setCreateError(data.message ?? "Create failed");
        return;
      }
      setCreateSuccess(`Task created${data.id ? ` (${data.id.slice(0, 8)}…)` : ""}.`);
      setForm((f) => ({
        ...f,
        title: "",
        description: "",
        target_url: "https://",
      }));
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="py-8 text-white max-w-4xl">
      <h1 className="text-xl font-bold text-white mb-2">Social tasks</h1>
      <p className="text-slate-400 text-sm mb-6">Review pending submissions, approve GPC rewards, and create new tasks.</p>

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {loadError}
        </div>
      )}
      {createError && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {createError}
        </div>
      )}
      {createSuccess && (
        <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
          {createSuccess}
        </div>
      )}

      <section className="mb-10 rounded-xl border border-white/10 bg-fintech-bg-card p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Create task</h2>
        <form onSubmit={(e) => void createTask(e)} className="space-y-4 max-w-xl">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Title</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={(e) =>
                  setForm((f) => ({ ...f, platform: e.target.value as (typeof PLATFORMS)[number] }))
                }
                className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Task type</label>
              <input
                required
                placeholder="follow, like, comment…"
                value={form.task_type}
                onChange={(e) => setForm((f) => ({ ...f, task_type: e.target.value }))}
                className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Reward (GPC)</label>
            <input
              required
              type="number"
              min={1}
              value={form.reward_gpc}
              onChange={(e) => setForm((f) => ({ ...f, reward_gpc: e.target.value }))}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <p className="text-xs text-slate-500 mt-1">100 GPC = $1.00</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Min tier</label>
              <select
                value={form.min_tier}
                onChange={(e) =>
                  setForm((f) => ({ ...f, min_tier: e.target.value as (typeof TIERS)[number] }))
                }
                className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
              >
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Max completions</label>
              <input
                required
                type="number"
                min={1}
                value={form.max_completions}
                onChange={(e) => setForm((f) => ({ ...f, max_completions: e.target.value }))}
                className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Target URL</label>
            <input
              required
              type="url"
              value={form.target_url}
              onChange={(e) => setForm((f) => ({ ...f, target_url: e.target.value }))}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.proof_required}
                onChange={(e) => setForm((f) => ({ ...f, proof_required: e.target.checked }))}
              />
              Proof required
            </label>
            <div>
              <label className="text-xs text-slate-400 mr-2">Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as "active" | "paused" }))
                }
                className="rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-sm text-white"
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={createBusy}
            className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white hover:bg-fintech-accent/90 disabled:opacity-50"
          >
            {createBusy ? "Creating…" : "Create task"}
          </button>
        </form>
      </section>

      <h2 className="text-lg font-semibold text-white mb-3">Pending submissions</h2>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : loadError ? null : items.length === 0 ? (
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
                  {row.task?.platform} · {row.task?.task_type} · {row.reward_gpc.toLocaleString()} GPC
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
