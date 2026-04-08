"use client";

import { useEffect, useState, useCallback } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";

const ACTION_BTN =
  "inline-flex items-center justify-center min-h-[36px] min-w-[60px] px-3 py-2 rounded-lg text-sm transition max-[480px]:w-full max-[480px]:min-w-0";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type AdType = "banner" | "video";
type Placement = "homepage" | "dashboard" | "arena";

interface Advertisement {
  id: string;
  title: string;
  description: string;
  ad_type: AdType;
  file_url: string | null;
  target_url: string | null;
  placement: Placement;
  active: boolean;
  impressions: number;
  clicks: number;
  created_at: string;
}

const PLACEMENTS: { value: Placement; label: string }[] = [
  { value: "homepage", label: "Homepage" },
  { value: "dashboard", label: "Dashboard" },
  { value: "arena", label: "Arena" },
];

const AD_TYPES: { value: AdType; label: string }[] = [
  { value: "banner", label: "Banner" },
  { value: "video", label: "Video" },
];

export default function AdminAdsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    ad_type: "banner" as AdType,
    file_url: "",
    target_url: "",
    placement: "homepage" as Placement,
    active: true,
  });

  const loadAds = useCallback(() => {
    if (!session) return;
    setLoading(true);
    fetch(`${API_BASE}/admin/advertisements`, { credentials: "include", headers: adminApiHeaders(session) })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => setAds(data.ads ?? []))
      .catch(() => setError("Failed to load advertisements"))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (session) loadAds();
  }, [session, loadAds]);

  async function handleUpload() {
    if (!session) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,video/mp4,.jpg,.jpeg,.png,.mp4";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploading(true);
      setSubmitError(null);
      try {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch(`${API_BASE}/admin/advertisements/upload`, {
          method: "POST",
          credentials: "include",
          headers: adminApiHeaders(session),
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Upload failed");
        setForm((f) => ({ ...f, file_url: data.url }));
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSuccess(null);
    if (!session) return;
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      ad_type: form.ad_type,
      file_url: form.file_url.trim() || null,
      target_url: form.target_url.trim() || null,
      placement: form.placement,
      active: form.active,
    };
    try {
      const res = await fetch(`${API_BASE}/admin/advertisements`, {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError((data.message as string) || "Failed to create");
        return;
      }
      setSuccess("Advertisement created.");
      setForm({
        title: "",
        description: "",
        ad_type: "banner",
        file_url: "",
        target_url: "",
        placement: "homepage",
        active: true,
      });
      loadAds();
    } catch {
      setSubmitError("Request failed");
    }
  }

  async function toggleActive(ad: Advertisement) {
    if (!session) return;
    try {
      const res = await fetch(`${API_BASE}/admin/advertisements`, {
        method: "PATCH",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ id: ad.id, active: !ad.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError((data.message as string) || "Update failed");
        return;
      }
      loadAds();
    } catch {
      setSubmitError("Update failed");
    }
  }

  async function handleDelete(ad: Advertisement) {
    if (!session || !confirm(`Delete "${ad.title}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/advertisements?id=${encodeURIComponent(ad.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError((data.message as string) || "Delete failed");
        return;
      }
      loadAds();
    } catch {
      setSubmitError("Delete failed");
    }
  }

  return (
    <div className="py-6 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
        <h1 className="text-xl font-bold text-white mb-2">Advertisement management</h1>
        <p className="text-fintech-muted">
          Upload banner images or videos, set destination URL and placement. Track impressions and clicks.
        </p>
        </div>
      </div>

      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-white mb-4">Add advertisement</h2>
        {submitError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{submitError}</div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/20 text-green-400 text-sm">{success}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fintech-muted mb-1">Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-fintech-muted focus:border-fintech-accent outline-none"
              placeholder="Ad title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fintech-muted mb-1">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-fintech-muted focus:border-fintech-accent outline-none"
              placeholder="Short description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fintech-muted mb-1">Ad type</label>
              <select
                value={form.ad_type}
                onChange={(e) => setForm((f) => ({ ...f, ad_type: e.target.value as AdType }))}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-fintech-accent outline-none"
              >
                {AD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-fintech-muted mb-1">Placement</label>
              <select
                value={form.placement}
                onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value as Placement }))}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-fintech-accent outline-none"
              >
                {PLACEMENTS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-fintech-muted mb-1">File (banner: jpg/png, video: mp4)</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={form.file_url}
                onChange={(e) => setForm((f) => ({ ...f, file_url: e.target.value }))}
                className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-fintech-muted focus:border-fintech-accent outline-none"
                placeholder="Upload or paste URL"
              />
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-fintech-muted mb-1">Destination URL</label>
            <input
              type="url"
              value={form.target_url}
              onChange={(e) => setForm((f) => ({ ...f, target_url: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-fintech-muted focus:border-fintech-accent outline-none"
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-fintech-muted">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="rounded border-white/20"
              />
              Active
            </label>
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-fintech-accent text-white font-medium hover:opacity-90"
          >
            Add advertisement
          </button>
        </form>
      </div>

      <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
        <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">All advertisements</h2>
        {error && <div className="p-4 text-red-400 text-sm">{error}</div>}
        {loading ? (
          <div className="p-6 text-fintech-muted">Loading…</div>
        ) : ads.length === 0 ? (
          <div className="p-6 text-fintech-muted">No advertisements yet. Create one above.</div>
        ) : (
          <>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full text-left min-w-[640px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-3 text-sm font-medium text-fintech-muted hidden sm:table-cell">ID</th>
                    <th className="p-3 text-sm font-medium text-fintech-muted">Title</th>
                    <th className="p-3 text-sm font-medium text-fintech-muted">Type</th>
                    <th className="p-3 text-sm font-medium text-fintech-muted">Placement</th>
                    <th className="p-3 text-sm font-medium text-fintech-muted hidden sm:table-cell">Impressions</th>
                    <th className="p-3 text-sm font-medium text-fintech-muted hidden sm:table-cell">Clicks</th>
                    <th className="p-3 text-sm font-medium text-fintech-muted">Status</th>
                    <th className="p-3 text-sm font-medium text-fintech-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((ad) => (
                    <tr key={ad.id} className="border-b border-white/5">
                      <td className="p-3 font-mono text-xs text-fintech-muted hidden sm:table-cell">{ad.id.slice(0, 8)}…</td>
                      <td className="p-3 text-white">{ad.title}</td>
                      <td className="p-3 text-fintech-muted capitalize">{ad.ad_type}</td>
                      <td className="p-3 text-fintech-muted">{ad.placement.replace("_", " ")}</td>
                      <td className="p-3 text-fintech-muted hidden sm:table-cell">{ad.impressions}</td>
                      <td className="p-3 text-fintech-muted hidden sm:table-cell">{ad.clicks}</td>
                      <td className="p-3">
                        <span className={ad.active ? "text-green-400" : "text-fintech-muted"}>
                          {ad.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2 max-[480px]:flex-col">
                          <button
                            type="button"
                            onClick={() => toggleActive(ad)}
                            className={`${ACTION_BTN} bg-white/10 text-white hover:bg-white/20`}
                          >
                            {ad.active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(ad)}
                            className={`${ACTION_BTN} bg-red-500/20 text-red-400 hover:bg-red-500/30`}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
          </>
        )}
      </div>
    </div>
  );
}
