"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { PageHeading, StatusBadge, LoadingState, EmptyState } from "@/components/ui/garmon-ui";
import { Play, ArrowUpRight, CheckCircle2, UserRound } from "lucide-react";
import { WATCH_SECONDS_REQUIRED } from "@/lib/watch-earn";

type FeedVideo = {
  id: string;
  title: string;
  creatorName?: string | null;
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

  if (loading) return <LoadingState label="Loading your watch feed…"/>;
  const progress=Math.min(100,(elapsed/WATCH_SECONDS_REQUIRED)*100);
  return <div className="gp-watch-page mx-auto space-y-6">
    <PageHeading eyebrow="DISCOVER · WATCH · EARN" title="Good content. Real rewards." description={`Watch creator videos for ${WATCH_SECONDS_REQUIRED} seconds. Earn GPC for eligible completed watches.`} action={<Link href="/dashboard/create-video" className="gp-button gp-button-ghost">Upload a video <ArrowUpRight size={16}/></Link>}/>
    {notice&&<div className="gp-notice" role="status">{notice}</div>}{error&&<div className="gp-notice gp-error" role="alert">{error}</div>}
    {!current ? <EmptyState title="You’re all caught up." description="No eligible videos are available right now. Check back for fresh creator content." action={<button type="button" onClick={()=>void loadFeed()} className="gp-button gp-button-violet">Refresh feed</button>}/> : <div className="gp-watch-feed">
      <div><article className="gp-watch-player relative"><div className="aspect-video bg-black"><video ref={videoRef} key={current.id} src={current.videoUrl} poster={current.thumbnailUrl??undefined} className="h-full w-full object-contain" playsInline muted={false} controls={phase==="watching"} onEnded={()=>{if(phase==="watching"&&elapsed>=WATCH_SECONDS_REQUIRED)completeWatch();}}/></div><div className="p-5"><div className="flex items-center gap-3"><span className="gp-icon-tile"><UserRound size={20}/></span><div className="min-w-0"><p className="text-xs text-fintech-muted">{current.creatorName||"Creator name unavailable"}</p><h2 className="mt-1 text-lg font-semibold text-white">{current.title}</h2></div></div><p className="mt-4 text-xs text-fintech-muted">{current.viewsCount.toLocaleString()} views · {current.remainingBudgetGpc.toLocaleString()} GPC budget remaining</p></div>{coinPop!=null&&<div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="gp-surface text-center"><p className="text-3xl font-bold text-fintech-success">+{coinPop} GPC</p><p className="mt-2 text-sm text-fintech-muted">Reward confirmed</p></div></div>}</article>
      {videos.length>1&&<div className="mt-4 flex gap-3"><button type="button" disabled={index<=0||phase==="watching"} onClick={()=>{setIndex(i=>Math.max(0,i-1));setPhase("idle");setSessionId(null);}} className="gp-button gp-button-ghost flex-1">Previous</button><button type="button" disabled={index>=videos.length-1||phase==="watching"} onClick={()=>{setIndex(i=>Math.min(videos.length-1,i+1));setPhase("idle");setSessionId(null);}} className="gp-button gp-button-ghost flex-1">Next video</button></div>}</div>
      <aside className="space-y-4"><section className="gp-surface"><StatusBadge tone={phase==="done"?"success":"gold"}>{phase==="done"?"COMPLETED":"WATCH REWARD"}</StatusBadge><h2 className="mt-5 text-3xl font-bold text-white">{current.payoutGpc} <span className="text-base text-fintech-muted">GPC</span></h2><p className="gp-description">Watch progress</p><div className="gp-watch-progress mt-3" role="progressbar" aria-label="Watch progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${phase==="done"?100:progress}%`}}/></div><p className="mt-3 text-xs text-fintech-muted" aria-live="polite">{phase==="idle"?`Ready for your ${WATCH_SECONDS_REQUIRED}-second watch`:phase==="done"?"Reward confirmed":phase==="crediting"?"Confirming your reward…":`${Math.max(0,Math.ceil(WATCH_SECONDS_REQUIRED-elapsed))} seconds remaining`}</p>
      {phase==="idle"&&<button type="button" onClick={startWatch} disabled={!!meta&&meta.remainingTodayGpc<=0} className="gp-button gp-button-gold mt-6 w-full"><Play size={17}/>Watch & Earn</button>}{phase==="done"&&<div className="gp-notice gp-success mt-5"><CheckCircle2 size={18}/>Watch completed</div>}</section>
      {meta&&<section className="gp-surface"><p className="gp-eyebrow">YOUR DAY SO FAR</p><p className="mt-4 text-2xl font-bold">{meta.earnedTodayGpc} <span className="text-sm text-fintech-muted">/ {meta.dailyCapGpc} GPC</span></p><p className="gp-description">{meta.remainingTodayGpc} GPC remaining today</p><StatusBadge>{meta.membershipTier} membership</StatusBadge></section>}<p className="px-2 text-xs leading-relaxed text-fintech-muted">Rewards remain subject to eligibility, completed watch verification, and daily limits. GPC is for on-platform use.</p></aside>
    </div>}
    {toast&&<div role="status" className="gp-notice gp-success">{toast}</div>}
  </div>;
}
