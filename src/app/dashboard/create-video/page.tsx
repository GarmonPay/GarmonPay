"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

type VideoRow = {
  id: string;
  title: string;
  status: string;
  budget_gpc: number;
  spent_gpc: number;
  views_count: number;
  created_at: string;
};

async function authFetch(path: string, init?: RequestInit) {
  const session = await getSessionAsync();
  if (!session?.accessToken) throw new Error("Not authenticated");
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.message === "string" ? data.message : "Request failed");
  }
  return data;
}

export default function CreateVideoPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [budgetGpc, setBudgetGpc] = useState("500");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myVideos, setMyVideos] = useState<VideoRow[]>([]);

  const loadMine = useCallback(async () => {
    try {
      const data = await authFetch("/api/creator/videos");
      setMyVideos(data.videos ?? []);
    } catch {
      setMyVideos([]);
    }
  }, []);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) router.replace("/login?next=/dashboard/create-video");
      else loadMine();
    });
  }, [router, loadMine]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const targetDemo: Record<string, unknown> = {};
      if (ageMin) targetDemo.age_min = Number(ageMin);
      if (ageMax) targetDemo.age_max = Number(ageMax);

      await authFetch("/api/creator/videos", {
        method: "POST",
        body: JSON.stringify({
          title,
          videoUrl,
          thumbnailUrl: thumbnailUrl || undefined,
          budgetGpc: Number(budgetGpc),
          targetDemo: Object.keys(targetDemo).length ? targetDemo : undefined,
        }),
      });
      setMessage("Video submitted for review. You will be notified when it is approved.");
      setTitle("");
      setVideoUrl("");
      setThumbnailUrl("");
      loadMine();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="card-lux p-4">
        <h1 className="text-xl font-bold text-white">Upload creator video</h1>
        <p className="mt-1 text-sm text-fintech-muted">
          Videos go to moderation before appearing in the Watch &amp; Earn feed. Budget is paid in
          GPC as earners complete 30-second watches.
        </p>
        <Link href="/dashboard/earn" className="mt-2 inline-block text-sm text-fintech-accent hover:underline">
          ← Back to Watch &amp; Earn
        </Link>
      </div>

      <form onSubmit={submit} className="card-lux p-4 space-y-4">
        <div>
          <label className="text-xs text-fintech-muted">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-fintech-muted">Video URL (https)</label>
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            required
            type="url"
            placeholder="https://..."
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-fintech-muted">Thumbnail URL (optional)</label>
          <input
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
            type="url"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-fintech-muted">Budget (GPC)</label>
          <input
            value={budgetGpc}
            onChange={(e) => setBudgetGpc(e.target.value)}
            required
            type="number"
            min={10}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-fintech-muted">Target age min (optional)</label>
            <input
              value={ageMin}
              onChange={(e) => setAgeMin(e.target.value)}
              type="number"
              min={13}
              max={99}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-fintech-muted">Target age max (optional)</label>
            <input
              value={ageMax}
              onChange={(e) => setAgeMax(e.target.value)}
              type="number"
              min={13}
              max={99}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-[#fde047]">{message}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-fintech-accent py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Submit for review"}
        </button>
      </form>

      {myVideos.length > 0 && (
        <div className="card-lux p-4">
          <h2 className="text-sm font-medium text-fintech-muted mb-3">Your videos</h2>
          <ul className="space-y-2 text-sm">
            {myVideos.map((v) => (
              <li key={v.id} className="flex justify-between gap-2 border-b border-white/5 pb-2">
                <span className="text-white truncate">{v.title}</span>
                <span className="shrink-0 text-fintech-muted capitalize">{v.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
