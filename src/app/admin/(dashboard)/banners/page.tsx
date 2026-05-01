"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";

const API_BASE = getApiRoot();

type BannerRow = {
  id: string;
  owner_user_id: string | null;
  title: string;
  image_url: string;
  target_url: string;
  type: string;
  status: string;
  impressions: number;
  clicks: number;
  created_at: string;
  owner_email?: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "short" });
}

function ctr(impressions: number, clicks: number): string {
  if (impressions === 0) return "0%";
  return ((clicks / impressions) * 100).toFixed(2) + "%";
}

function AdminBannersPageInner() {
  const session = useAdminSession();
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/admin/banners`, { credentials: "include", headers: adminApiHeaders(session) })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Access denied" : "Failed to load");
        return r.json();
      })
      .then((data) => {
        setBanners(data.banners ?? []);
        setError(null);
      })
      .catch(() => setError("Failed to load banners"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.adminId]);

  async function updateStatus(id: string, status: string) {
    setActionError(null);
    setUpdatingId(id);
    try {
      const res = await fetch(`${API_BASE}/admin/banners`, {
        method: "PATCH",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((data.message as string) || "Action failed");
        return;
      }
      load();
    } catch {
      setActionError("Request failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteBanner(id: string) {
    if (!confirm("Delete this banner?")) return;
    setActionError(null);
    setUpdatingId(id);
    try {
      const res = await fetch(`${API_BASE}/admin/banners`, {
        method: "PATCH",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "delete" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((data.message as string) || "Delete failed");
        return;
      }
      load();
    } catch {
      setActionError("Request failed");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-2">Banner Control Panel</h1>
      <p className="text-fintech-muted mb-6">
        View, approve, pause, or delete banners. Only active banners appear in the rotator.
      </p>
      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{actionError}</div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      {loading ? (
        <p className="text-fintech-muted">Loading…</p>
      ) : error ? null : banners.length === 0 ? (
        <p className="text-fintech-muted">No banners.</p>
      ) : (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-sm font-medium text-fintech-muted">Preview</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Title</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Owner</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Type</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Status</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Impressions</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Clicks</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">CTR</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Created</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {banners.map((b) => (
                  <tr key={b.id} className="border-b border-white/5">
                    <td className="p-3">
                      <Image src={b.image_url} alt="" width={120} height={48} className="h-12 w-auto max-w-[120px] object-contain rounded bg-black/20" unoptimized />
                    </td>
                    <td className="p-3 text-white">{b.title || "—"}</td>
                    <td className="p-3 text-fintech-muted text-sm">{b.owner_email ?? "—"}</td>
                    <td className="p-3 text-fintech-muted capitalize">{b.type}</td>
                    <td className="p-3">
                      <span
                        className={
                          b.status === "active"
                            ? "text-emerald-400"
                            : b.status === "paused"
                              ? "text-amber-400"
                              : "text-fintech-muted"
                        }
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="p-3 text-white">{b.impressions}</td>
                    <td className="p-3 text-white">{b.clicks}</td>
                    <td className="p-3 text-emerald-400">{ctr(b.impressions, b.clicks)}</td>
                    <td className="p-3 text-fintech-muted text-sm">{formatDate(b.created_at)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {b.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => updateStatus(b.id, "active")}
                            disabled={updatingId === b.id}
                            className="px-2 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {b.status === "active" && (
                          <button
                            type="button"
                            onClick={() => updateStatus(b.id, "paused")}
                            disabled={updatingId === b.id}
                            className="px-2 py-1 rounded bg-amber-600 text-white text-xs hover:bg-amber-500 disabled:opacity-50"
                          >
                            Pause
                          </button>
                        )}
                        {b.status === "paused" && (
                          <button
                            type="button"
                            onClick={() => updateStatus(b.id, "active")}
                            disabled={updatingId === b.id}
                            className="px-2 py-1 rounded-xl bg-fintech-accent text-white text-xs hover:bg-fintech-accent/90 disabled:opacity-50"
                          >
                            Activate
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteBanner(b.id)}
                          disabled={updatingId === b.id}
                          className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-500 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminBannersPage() {
  return (
    <AdminPageGate>
      <AdminBannersPageInner />
    </AdminPageGate>
  );
}
