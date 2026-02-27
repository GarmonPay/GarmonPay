"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";

type AdvertiserAd = {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  image_url: string | null;
  budget: number;
  status: string;
  created_at: string;
};

function authHeaders(tokenOrId: string, isToken: boolean): Record<string, string> {
  return isToken
    ? { Authorization: `Bearer ${tokenOrId}` }
    : { "X-User-Id": tokenOrId };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CreateAdvertiserAdPage() {
  const router = useRouter();
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ads, setAds] = useState<AdvertiserAd[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    budget: "",
  });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  function resetForm() {
    setForm({ title: "", description: "", budget: "" });
    setVideoFile(null);
    setImageFile(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function loadAds(tokenOrId: string, isToken: boolean) {
    const res = await fetch("/api/ads/list", {
      headers: authHeaders(tokenOrId, isToken),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { message?: string }).message ?? "Failed to load ads");
    }
    setAds(Array.isArray((data as { ads?: unknown[] }).ads) ? (data as { ads: AdvertiserAd[] }).ads : []);
  }

  useEffect(() => {
    getSessionAsync()
      .then(async (s) => {
        if (!s) {
          router.replace("/login?next=/dashboard/ads/create");
          return;
        }
        const tokenOrId = s.accessToken ?? s.userId;
        const isToken = Boolean(s.accessToken);
        setSession({ tokenOrId, isToken });
        await loadAds(tokenOrId, isToken);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load advertiser portal");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleCreateAd(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;

    setError(null);
    setSuccess(null);

    const budget = Number.parseFloat(form.budget);
    if (!Number.isFinite(budget) || budget <= 0) {
      setError("Budget must be greater than 0.");
      return;
    }
    if (!videoFile && !imageFile) {
      setError("Upload at least one video or image file.");
      return;
    }

    const payload = new FormData();
    payload.set("title", form.title.trim());
    payload.set("description", form.description.trim());
    payload.set("budget", String(budget));
    if (videoFile) payload.set("video_file", videoFile);
    if (imageFile) payload.set("image_file", imageFile);

    setSubmitting(true);
    try {
      const res = await fetch("/api/ads/create", {
        method: "POST",
        headers: authHeaders(session.tokenOrId, session.isToken),
        body: payload,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? "Failed to create ad");
      }
      setSuccess("Ad submitted for review.");
      resetForm();
      await loadAds(session.tokenOrId, session.isToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create ad");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-fintech-muted">Loading advertiser portal…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h1 className="text-xl font-bold text-white mb-2">Create Ad</h1>
        <p className="text-sm text-fintech-muted mb-6">
          Upload video/image creative, set a budget, and submit for admin approval.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/20 text-green-400 text-sm">{success}</div>
        )}

        <form onSubmit={handleCreateAd} className="space-y-4">
          <div>
            <label className="block text-sm text-fintech-muted mb-1">Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white focus:border-fintech-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-fintech-muted mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white focus:border-fintech-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-fintech-muted mb-1">Budget (USD)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.budget}
              onChange={(e) => setForm((prev) => ({ ...prev, budget: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white focus:border-fintech-accent focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white hover:bg-white/10"
            >
              Upload Video
            </button>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white hover:bg-white/10"
            >
              Upload Image
            </button>
          </div>

          <div className="text-xs text-fintech-muted">
            {videoFile ? `Video: ${videoFile.name}` : "No video selected"} ·{" "}
            {imageFile ? `Image: ${imageFile.name}` : "No image selected"}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="min-h-touch rounded-xl bg-fintech-accent px-5 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Create Ad"}
          </button>
        </form>
      </section>

      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-white">My Ad Submissions</h2>
          <Link href="/dashboard/ads" className="text-sm text-fintech-accent hover:underline">
            Back to ads →
          </Link>
        </div>

        {ads.length === 0 ? (
          <p className="text-sm text-fintech-muted">No ad submissions yet.</p>
        ) : (
          <ul className="space-y-3">
            {ads.map((ad) => (
              <li key={ad.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-white">{ad.title}</p>
                  <span className="text-xs uppercase tracking-wide text-fintech-muted">{ad.status}</span>
                </div>
                <p className="text-sm text-fintech-muted mt-1">{ad.description || "No description"}</p>
                <p className="text-sm text-white mt-2">Budget: {formatCents(Number(ad.budget ?? 0))}</p>
                <p className="text-xs text-fintech-muted mt-1">
                  {new Date(ad.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
