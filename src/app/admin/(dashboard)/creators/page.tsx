"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { localeInt } from "@/lib/format-number";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import { ActionButton } from "@/components/admin/ActionButton";

const API_BASE = getApiRoot();

type CreatorRow = {
  creator_id: string;
  email: string | null;
  username: string | null;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  spent_gpc: number;
  last_upload_at: string;
};

type VideoRow = {
  id: string;
  title: string;
  status: string;
  budget_gpc: number;
  spent_gpc: number;
  views_count: number;
  created_at: string;
};

function AdminCreatorsInner() {
  const session = useAdminSession();
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [selected, setSelected] = useState<CreatorRow | null>(null);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/creators`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load");
      setCreators(data.creators ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  async function openCreator(c: CreatorRow) {
    setSelected(c);
    setDetailLoading(true);
    setVideos([]);
    try {
      const res = await fetch(`${API_BASE}/admin/creators?creatorId=${encodeURIComponent(c.creator_id)}`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load videos");
      setVideos(data.videos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load videos");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="p-4 tablet:p-6 space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Creators</h1>
          <p className="text-sm text-fintech-muted mt-1">
            Accounts with uploaded watch-earn videos.{" "}
            <Link href="/admin/videos" className="text-fintech-accent hover:underline">
              Video moderation
            </Link>
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-fintech-muted">Loading…</p>
      ) : creators.length === 0 ? (
        <p className="text-fintech-muted">No creators with videos yet.</p>
      ) : (
        <div className="card-lux overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[720px]">
            <thead>
              <tr className="border-b border-white/10 text-fintech-muted">
                <th className="p-3">Creator</th>
                <th className="p-3">Videos</th>
                <th className="p-3">Pending / Approved / Rejected</th>
                <th className="p-3">Spent GPC</th>
                <th className="p-3">Last upload</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {creators.map((c) => (
                <tr key={c.creator_id} className="border-b border-white/5 text-white">
                  <td className="p-3">
                    <p>{c.email ?? c.username ?? c.creator_id.slice(0, 8)}</p>
                    {c.username && c.email && (
                      <p className="text-xs text-fintech-muted">@{c.username}</p>
                    )}
                  </td>
                  <td className="p-3">{c.total}</td>
                  <td className="p-3 text-fintech-muted">
                    {c.pending} / {c.approved} / {c.rejected}
                  </td>
                  <td className="p-3">{localeInt(c.spent_gpc)}</td>
                  <td className="p-3 text-xs text-fintech-muted">
                    {c.last_upload_at ? new Date(c.last_upload_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-3">
                    <ActionButton onClick={() => void openCreator(c)}>View</ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-[#7c3aed]/30 bg-[#0e0118] p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[#f5c842]">
              {selected.email ?? selected.username ?? selected.creator_id}
            </h2>
            <p className="text-sm text-white/60 mt-1">
              {selected.total} videos · {localeInt(selected.spent_gpc)} GPC spent
            </p>
            {detailLoading ? (
              <p className="mt-4 text-fintech-muted">Loading videos…</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {videos.map((v) => (
                  <li key={v.id} className="rounded-lg border border-white/10 p-3 text-sm">
                    <p className="font-medium text-white">{v.title}</p>
                    <p className="text-xs text-fintech-muted capitalize">
                      {v.status} · {v.views_count} views · spent {localeInt(v.spent_gpc)} /{" "}
                      {localeInt(v.budget_gpc)} GPC
                    </p>
                  </li>
                ))}
                {videos.length === 0 && <p className="text-fintech-muted">No videos.</p>}
              </ul>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Link
                href="/admin/videos"
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5"
              >
                Open videos
              </Link>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-white/20 px-4 py-2 text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminCreatorsPage() {
  return (
    <AdminPageGate>
      <AdminCreatorsInner />
    </AdminPageGate>
  );
}
