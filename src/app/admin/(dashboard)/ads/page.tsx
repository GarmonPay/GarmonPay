"use client";

import { useEffect, useState } from "react";
import { getAdminSession } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

const AD_TYPES = [
  { value: "video", label: "Video" },
  { value: "image", label: "Image" },
  { value: "text", label: "Text" },
  { value: "link", label: "Link" },
] as const;

type AdItem = {
  id: string;
  title: string;
  adType: string;
  rewardCents: number;
  requiredSeconds: number;
  active: boolean;
  createdAt: string;
  advertiser_price?: number;
  user_reward?: number;
  profit_amount?: number;
  description?: string;
  videoUrl?: string;
  imageUrl?: string;
  textContent?: string;
  targetUrl?: string;
};

export default function AdminAdsPage() {
  const session = getAdminSession();
  const [ads, setAds] = useState<AdItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "text" as string,
    media_url: "",
    advertiser_price: 100,
    user_reward: 50,
    duration_seconds: 10,
    status: "active" as "active" | "inactive",
    text_content: "",
  });

  const profit = Math.max(0, (form.advertiser_price ?? 0) - (form.user_reward ?? 0));

  function loadAds() {
    if (!session) return;
    setLoading(true);
    fetch(`${API_BASE}/admin/ads`, { headers: { "X-Admin-Id": session.adminId } })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load ads");
        return res.json();
      })
      .then((data) => setAds(data.ads ?? []))
      .catch(() => setError("Failed to load ads"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (session) loadAds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.adminId]);

  async function handleUpload(field: "media_url") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*,image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !session) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch(`${API_BASE}/admin/ads/upload`, {
          method: "POST",
          headers: { "X-Admin-Id": session.adminId },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Upload failed");
        setForm((f) => ({ ...f, [field]: data.url }));
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
    const mediaUrl = form.type === "text" ? undefined : form.media_url.trim() || undefined;
    const payload = {
      title: form.title.trim(),
      description: form.type === "text" ? form.text_content.trim() : form.description.trim(),
      type: form.type,
      media_url: mediaUrl ?? null,
      advertiser_price: form.advertiser_price,
      user_reward: form.user_reward,
      duration_seconds: Math.max(1, form.duration_seconds),
      status: form.status,
    };
    try {
      const res = await fetch(`${API_BASE}/admin/ads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Id": session.adminId,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError((data.message as string) || "Failed to create ad");
        return;
      }
      setSuccess("Ad created.");
      setForm({
        title: "",
        description: "",
        type: "text",
        media_url: "",
        advertiser_price: 100,
        user_reward: 50,
        duration_seconds: 10,
        status: "active",
        text_content: "",
      });
      loadAds();
    } catch {
      setSubmitError("Request failed");
    }
  }

  async function toggleStatus(ad: AdItem) {
    if (!session) return;
    const newStatus = ad.active ? "inactive" : "active";
    try {
      const res = await fetch(`${API_BASE}/admin/ads`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Id": session.adminId,
        },
        body: JSON.stringify({ id: ad.id, status: newStatus }),
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

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Ads</h1>
        <p className="text-[#9ca3af]">
          Create ads with advertiser price and user reward. Profit is calculated automatically. Upload media or paste URL.
        </p>
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-white mb-4">Add ad</h2>
        {submitError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{submitError}</div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/20 text-green-400 text-sm">{success}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-1">Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-[#6b7280] focus:border-[#3b82f6] outline-none"
              placeholder="Ad title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-1">Ad type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-[#3b82f6] outline-none"
            >
              {AD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1">Advertiser price (¢)</label>
              <input
                type="number"
                min={0}
                value={form.advertiser_price}
                onChange={(e) => setForm((f) => ({ ...f, advertiser_price: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-[#3b82f6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1">User reward (¢)</label>
              <input
                type="number"
                min={0}
                value={form.user_reward}
                onChange={(e) => setForm((f) => ({ ...f, user_reward: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-[#3b82f6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1">Profit (¢)</label>
              <div className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-green-400 font-medium">
                {profit}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1">Duration (seconds)</label>
              <input
                type="number"
                min={1}
                value={form.duration_seconds}
                onChange={(e) => setForm((f) => ({ ...f, duration_seconds: Number(e.target.value) || 1 }))}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-[#3b82f6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-[#3b82f6] outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          {form.type === "video" && (
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1">Video URL or upload</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={form.media_url}
                  onChange={(e) => setForm((f) => ({ ...f, media_url: e.target.value }))}
                  className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-[#6b7280] focus:border-[#3b82f6] outline-none"
                  placeholder="https://... or upload"
                />
                <button
                  type="button"
                  onClick={() => handleUpload("media_url")}
                  disabled={uploading}
                  className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          )}
          {form.type === "image" && (
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1">Image URL or upload</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={form.media_url}
                  onChange={(e) => setForm((f) => ({ ...f, media_url: e.target.value }))}
                  className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-[#6b7280] focus:border-[#3b82f6] outline-none"
                  placeholder="https://... or upload"
                />
                <button
                  type="button"
                  onClick={() => handleUpload("media_url")}
                  disabled={uploading}
                  className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          )}
          {form.type === "link" && (
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1">Target URL</label>
              <input
                type="url"
                value={form.media_url}
                onChange={(e) => setForm((f) => ({ ...f, media_url: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-[#6b7280] focus:border-[#3b82f6] outline-none"
                placeholder="https://..."
              />
            </div>
          )}
          {form.type === "text" && (
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1">Text content / description</label>
              <textarea
                value={form.text_content}
                onChange={(e) => setForm((f) => ({ ...f, text_content: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-[#6b7280] focus:border-[#3b82f6] outline-none"
                placeholder="Ad copy"
              />
            </div>
          )}
          {form.type !== "text" && (
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1">Description (optional)</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-[#6b7280] focus:border-[#3b82f6] outline-none"
                placeholder="Short description"
              />
            </div>
          )}
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#3b82f6] text-white font-medium hover:opacity-90"
          >
            Add ad
          </button>
        </form>
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
        <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">All ads</h2>
        {error && <div className="p-4 text-red-400 text-sm">{error}</div>}
        {loading ? (
          <div className="p-6 text-[#9ca3af]">Loading…</div>
        ) : ads.length === 0 ? (
          <div className="p-6 text-[#9ca3af]">No ads yet. Create one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Title</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Type</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Advertiser</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">User reward</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Profit</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Duration</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Status</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Action</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr key={ad.id} className="border-b border-white/5">
                    <td className="p-3 text-white">{ad.title}</td>
                    <td className="p-3 text-[#9ca3af] capitalize">{(ad.adType === "website_visit" ? "link" : ad.adType).replace("_", " ")}</td>
                    <td className="p-3 text-[#9ca3af]">${((ad.advertiser_price ?? 0) / 100).toFixed(2)}</td>
                    <td className="p-3 text-[#9ca3af]">${(ad.rewardCents / 100).toFixed(2)}</td>
                    <td className="p-3 text-green-400">${((ad.profit_amount ?? 0) / 100).toFixed(2)}</td>
                    <td className="p-3 text-[#9ca3af]">{ad.requiredSeconds}s</td>
                    <td className="p-3">
                      <span className={ad.active ? "text-green-400" : "text-[#6b7280]"}>
                        {ad.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => toggleStatus(ad)}
                        className="text-sm px-2 py-1 rounded bg-white/10 text-white hover:bg-white/20"
                      >
                        {ad.active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
