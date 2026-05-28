"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { WATCH_SECONDS_REQUIRED } from "@/lib/watch-earn";

type FeedVideo = {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  viewsCount: number;
  payoutGpc: number;
  remainingBudgetGpc: number;
};

type FeedMeta = {
  payoutGpc: number;
  dailyCapGpc: number;
  earnedTodayGpc: number;
  remainingTodayGpc: number;
  membershipTier: string;
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

export default function WatchEarnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [index, setIndex] = useState(0);
  const [meta, setMeta] = useState<FeedMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [watchStartedAt, setWatchStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<"idle" | "watching" | "crediting" | "done">("idle");
  const [toast, setToast] = useState<string | null>(null);
  const [coinPop, setCoinPop] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const current = videos[index] ?? null;

  useEffect(() => {
    const n = searchParams.get("notice");
    if (n === "social-retired") {
      setNotice("Social tasks are retired. Earn GPC by watching creator videos below.");
      router.replace("/dashboard/earn");
    }
  }, [searchParams, router]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getSessionAsync();
      if (!s) {
        router.replace("/login?next=/dashboard/earn");
        return;
      }
      const data = await authFetch("/api/earn/feed");
      setVideos(data.videos ?? []);
      setMeta({
        payoutGpc: data.payoutGpc ?? 10,
        dailyCapGpc: data.dailyCapGpc ?? 50,
        earnedTodayGpc: data.earnedTodayGpc ?? 0,
        remainingTodayGpc: data.remainingTodayGpc ?? 0,
        membershipTier: data.membershipTier ?? "free",
      });
      setIndex(0);
      setPhase("idle");
      setSessionId(null);
      setWatchStartedAt(null);
      setElapsed(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load feed");
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (phase !== "watching" || watchStartedAt == null) return;
    const t = window.setInterval(() => {
      setElapsed(Math.min(WATCH_SECONDS_REQUIRED, (Date.now() - watchStartedAt) / 1000));
    }, 200);
    return () => clearInterval(t);
  }, [phase, watchStartedAt]);

  const startWatch = useCallback(async () => {
    if (!current || phase !== "idle") return;
    if (meta && meta.remainingTodayGpc <= 0) {
      setToast("Daily GPC limit reached");
      return;
    }
    setError(null);
    try {
      const data = await authFetch("/api/earn/watch/start", {
        method: "POST",
        body: JSON.stringify({ videoId: current.id }),
      });
      setSessionId(data.sessionId);
      setWatchStartedAt(Date.now());
      setElapsed(0);
      setPhase("watching");
      videoRef.current?.play().catch(() => {});
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not start watch");
    }
  }, [current, phase, meta]);

  const completeWatch = useCallback(async () => {
    if (!sessionId || phase !== "watching") return;
    if (elapsed < WATCH_SECONDS_REQUIRED) {
      setToast(`Keep watching — ${Math.ceil(WATCH_SECONDS_REQUIRED - elapsed)}s left`);
      return;
    }
    setPhase("crediting");
    try {
      const data = await authFetch("/api/earn/watch/complete", {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      });
      setCoinPop(data.gpcAwarded ?? meta?.payoutGpc ?? 0);
      setPhase("done");
      setTimeout(() => {
        setCoinPop(null);
        setVideos((prev) => prev.filter((v) => v.id !== current?.id));
        setIndex(0);
        setPhase("idle");
        setSessionId(null);
        setWatchStartedAt(null);
        setElapsed(0);
        loadFeed();
      }, 1800);
    } catch (e) {
      setPhase("watching");
      setToast(e instanceof Error ? e.message : "Could not complete watch");
    }
  }, [sessionId, phase, elapsed, current, meta, loadFeed]);

  useEffect(() => {
    if (phase === "watching" && elapsed >= WATCH_SECONDS_REQUIRED) {
      completeWatch();
    }
  }, [phase, elapsed, completeWatch]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading) {
    return (
      <div className="card-lux p-8 text-center text-fintech-muted">Loading watch feed…</div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="card-lux p-4">
        <h1 className="text-xl font-bold text-white">Watch &amp; Earn</h1>
        <p className="mt-1 text-sm text-fintech-muted">
          Watch creator videos for {WATCH_SECONDS_REQUIRED} seconds. Earn GPC — on-platform only.
        </p>
        {meta && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-fintech-muted">
            <span>
              Today:{" "}
              <span className="text-[#fde047] font-semibold">
                {meta.earnedTodayGpc} / {meta.dailyCapGpc} GPC
              </span>
            </span>
            <span className="capitalize">Tier: {meta.membershipTier}</span>
            <span>+{meta.payoutGpc} GPC per watch</span>
          </div>
        )}
        <Link
          href="/dashboard/create-video"
          className="mt-3 inline-block text-sm text-fintech-accent hover:underline"
        >
          Upload your video →
        </Link>
      </div>

      {notice && (
        <p className="rounded-xl border border-[#eab308]/40 bg-[#eab308]/10 px-4 py-3 text-sm text-[#fde047]">
          {notice}
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {!current ? (
        <div className="card-lux p-8 text-center text-fintech-muted">
          <p>No videos available right now.</p>
          <button
            type="button"
            onClick={() => loadFeed()}
            className="mt-4 rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-card">
          <div className="aspect-[9/16] max-h-[70vh] w-full bg-black">
            <video
              ref={videoRef}
              key={current.id}
              src={current.videoUrl}
              poster={current.thumbnailUrl ?? undefined}
              className="h-full w-full object-contain"
              playsInline
              muted={false}
              controls={phase === "watching"}
              onEnded={() => {
                if (phase === "watching" && elapsed >= WATCH_SECONDS_REQUIRED) {
                  completeWatch();
                }
              }}
            />
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4">
            <h2 className="text-lg font-semibold text-white line-clamp-2">{current.title}</h2>
            <p className="text-xs text-violet-200/80 mt-1">
              {current.viewsCount} views · {current.remainingBudgetGpc} GPC budget left
            </p>

            {phase === "idle" && (
              <button
                type="button"
                onClick={startWatch}
                disabled={!!meta && meta.remainingTodayGpc <= 0}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#eab308] to-[#fde047] py-3.5 text-sm font-bold text-[#0c0618] disabled:opacity-50"
              >
                Watch {WATCH_SECONDS_REQUIRED}s to earn {current.payoutGpc} GPC
              </button>
            )}

            {phase === "watching" && (
              <div className="mt-4">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-[#eab308] transition-all duration-200"
                    style={{
                      width: `${Math.min(100, (elapsed / WATCH_SECONDS_REQUIRED) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-center text-sm text-white">
                  {elapsed < WATCH_SECONDS_REQUIRED
                    ? `${Math.ceil(WATCH_SECONDS_REQUIRED - elapsed)}s remaining`
                    : "Crediting…"}
                </p>
              </div>
            )}

            {phase === "crediting" && (
              <p className="mt-4 text-center text-sm text-[#fde047]">Crediting GPC…</p>
            )}
          </div>

          {coinPop != null && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="animate-scale-in rounded-2xl bg-[#eab308]/90 px-8 py-6 text-center shadow-2xl">
                <p className="text-3xl font-black text-[#0c0618]">+{coinPop} GPC</p>
                <p className="text-sm text-[#0c0618]/80 mt-1">Nice watch!</p>
              </div>
            </div>
          )}
        </div>
      )}

      {videos.length > 1 && current && (
        <div className="flex justify-between gap-2">
          <button
            type="button"
            disabled={index <= 0 || phase === "watching"}
            onClick={() => {
              setIndex((i) => Math.max(0, i - 1));
              setPhase("idle");
              setSessionId(null);
            }}
            className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-white disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={index >= videos.length - 1 || phase === "watching"}
            onClick={() => {
              setIndex((i) => Math.min(videos.length - 1, i + 1));
              setPhase("idle");
              setSessionId(null);
            }}
            className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-white disabled:opacity-40"
          >
            Skip
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-fintech-bg-card px-4 py-2 text-sm text-white shadow-lg border border-white/10">
          {toast}
        </div>
      )}
    </div>
  );
}
