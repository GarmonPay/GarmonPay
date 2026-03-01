"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { getBanners, getDashboard } from "@/lib/api";
import { getReferralLink } from "@/lib/site-url";
import { ReferralBannerCreator } from "@/components/banners/ReferralBannerCreator";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

type BannerItem = {
  id: string;
  title: string;
  image_url: string;
  target_url: string;
  type: string;
  status: string;
  impressions: number;
  clicks: number;
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "short" });
}

function ctr(impressions: number, clicks: number): string {
  if (impressions === 0) return "0%";
  return ((clicks / impressions) * 100).toFixed(2) + "%";
}

export default function BannersPage() {
  const router = useRouter();
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [referralLink, setReferralLink] = useState("");

  const load = useCallback(() => {
    getSessionAsync()
      .then((session) => {
        if (!session?.accessToken) {
          router.replace("/login?next=/dashboard/banners");
          return;
        }
        Promise.all([
          getBanners(session.accessToken, true),
          getDashboard(session.accessToken, true).catch(() => null),
        ]).then(([bannersData, dash]) => {
          setBanners(bannersData.banners ?? []);
          if (dash?.referralCode) {
            setReferralLink(getReferralLink(dash.referralCode));
          }
        });
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!file) {
      setSubmitError("Choose an image file (JPEG, PNG, GIF, or WebP, max 2MB).");
      return;
    }
    if (!targetUrl.trim()) {
      setSubmitError("Enter a valid HTTPS target URL.");
      return;
    }
    const session = await getSessionAsync();
    if (!session?.accessToken) {
      setSubmitError("Session expired. Please log in again.");
      return;
    }
    setSubmitting(true);
    const formData = new FormData();
    formData.set("title", title.trim() || "Banner");
    formData.set("target_url", targetUrl.trim());
    formData.set("file", file);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.accessToken}`,
    };
    try {
      const res = await fetch(`${API_BASE}/api/banners`, {
        method: "POST",
        headers,
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError((data.message as string) || "Upload failed");
        return;
      }
      setTitle("");
      setTargetUrl("");
      setFile(null);
      load();
    } catch {
      setSubmitError("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-fintech-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h1 className="text-xl font-bold text-white mb-1">Banner Advertising</h1>
        <p className="text-fintech-muted text-sm">
          Upload banners for the rotator. Admin approval is required before they go live.
        </p>
      </div>

      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Upload New Banner
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
          {submitError && (
            <p className="text-sm text-red-400">{submitError}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-fintech-muted mb-1">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Banner"
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-fintech-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fintech-muted mb-1">Target URL (HTTPS required)</label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-fintech-muted"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fintech-muted mb-1">Banner image (JPEG, PNG, GIF, WebP — max 2MB)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-fintech-muted file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-fintech-accent file:text-white"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !file || !targetUrl.trim()}
            className="px-4 py-2 rounded-lg bg-fintech-accent text-white font-medium text-sm hover:bg-fintech-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Uploading…" : "Save banner"}
          </button>
        </form>
      </section>

      {referralLink && (
        <ReferralBannerCreator referralLink={referralLink} />
      )}

      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6 overflow-hidden">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Your Banners &amp; Analytics
        </h2>
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        {banners.length === 0 ? (
          <p className="text-fintech-muted italic">No banners yet. Upload one above.</p>
        ) : (
          <div className="overflow-x-auto -mx-6 sm:mx-0">
            <table className="w-full text-left min-w-[600px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Preview</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Title</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Status</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Impressions</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Clicks</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">CTR</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Created</th>
                </tr>
              </thead>
              <tbody>
                {banners.map((b) => (
                  <tr key={b.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.image_url} alt="" className="h-12 w-auto max-w-[120px] object-contain rounded bg-black/20" />
                    </td>
                    <td className="p-3 text-white">{b.title || "—"}</td>
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
                    <td className="p-3 text-fintech-muted">{b.impressions}</td>
                    <td className="p-3 text-fintech-muted">{b.clicks}</td>
                    <td className="p-3 text-fintech-money">{ctr(b.impressions, b.clicks)}</td>
                    <td className="p-3 text-fintech-muted text-sm">{formatDate(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
