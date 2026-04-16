"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { getSessionAsync } from "@/lib/session";
import { userMeetsMinTier, isEliteOrHigher } from "@/lib/social-tier";
import { localeInt } from "@/lib/format-number";

type SocialTask = {
  id: string;
  title: string;
  description: string | null;
  platform: string;
  task_type: string;
  reward_gpc: number;
  min_tier: string;
  proof_required: boolean;
  target_url: string;
  max_completions: number;
  completions: number;
  status: string;
};

type Completion = {
  id: string;
  task_id: string;
  status: string;
  reward_gpc: number;
  completed_at: string;
};

const PLATFORMS = [
  { key: "all", label: "All" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "twitter", label: "Twitter" },
  { key: "facebook", label: "Facebook" },
  { key: "twitch", label: "Twitch" },
] as const;

function platformEmoji(platform: string): string {
  const p = platform.toLowerCase();
  if (p === "instagram") return "📸";
  if (p === "tiktok") return "🎵";
  if (p === "youtube") return "▶️";
  if (p === "twitter") return "𝕏";
  if (p === "facebook") return "📘";
  if (p === "twitch") return "💜";
  return "📱";
}

function startOfTodayUtc(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

async function authFetchSocial(url: string, body: Record<string, unknown>) {
  const supabase = createBrowserClient();
  if (!supabase) throw new Error("Not configured");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

export default function SocialTasksEarnPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<SocialTask[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [membership, setMembership] = useState<string>("free");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [modalTask, setModalTask] = useState<SocialTask | null>(null);
  const [step, setStep] = useState(1);
  const [proofUrl, setProofUrl] = useState("");
  const [claimStartedAt, setClaimStartedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const session = await getSessionAsync();
    if (!session?.userId) {
      router.replace("/login?next=/dashboard/earn/social");
      return;
    }
    const sb = createBrowserClient();
    if (!sb) {
      setLoading(false);
      return;
    }
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      router.replace("/login?next=/dashboard/earn/social");
      return;
    }

    const [{ data: taskRows, error: tErr }, { data: compRows, error: cErr }, { data: userRow }] =
      await Promise.all([
        sb.from("social_tasks").select("*").eq("status", "active").order("created_at", { ascending: false }),
        sb
          .from("social_task_completions")
          .select("id, task_id, status, reward_gpc, completed_at")
          .eq("user_id", user.id),
        sb.from("users").select("membership").eq("id", user.id).maybeSingle(),
      ]);

    if (tErr) console.error(tErr);
    if (cErr) console.error(cErr);

    setTasks((taskRows ?? []) as SocialTask[]);
    setCompletions((compRows ?? []) as Completion[]);
    setMembership(((userRow as { membership?: string } | null)?.membership ?? "free") as string);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const completionByTask = useMemo(() => {
    const m = new Map<string, Completion>();
    for (const c of completions) {
      m.set(c.task_id, c);
    }
    return m;
  }, [completions]);

  const stats = useMemo(() => {
    const t0 = startOfTodayUtc();
    const available = tasks.filter(
      (t) => t.status === "active" && userMeetsMinTier(membership, t.min_tier)
    ).length;
    const approvedToday = completions.filter((c) => {
      if (c.status !== "approved") return false;
      return new Date(c.completed_at).getTime() >= t0;
    });
    const earningsTodayGpc = approvedToday.reduce((s, c) => s + c.reward_gpc, 0);
    const completedToday = approvedToday.length;
    return {
      tasksAvailable: available,
      earningsTodayGpc,
      tasksCompletedToday: completedToday,
    };
  }, [tasks, completions, membership]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (platformFilter !== "all" && t.platform.toLowerCase() !== platformFilter) return false;
      return userMeetsMinTier(membership, t.min_tier);
    });
  }, [tasks, platformFilter, membership]);

  function openClaim(t: SocialTask) {
    setModalTask(t);
    setStep(1);
    setProofUrl("");
    setError(null);
    setClaimStartedAt(new Date().toISOString());
  }

  async function submitClaim() {
    if (!modalTask) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetchSocial("/api/social/submit", {
        task_id: modalTask.id,
        proof_url: proofUrl,
        ...(claimStartedAt ? { claimed_at: claimStartedAt } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? data.message ?? "Submit failed");
        return;
      }
      setModalTask(null);
      setClaimStartedAt(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const tierLabel = membership.charAt(0).toUpperCase() + membership.slice(1);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-violet-200/80"
        style={{ background: "#0e0118", fontFamily: '"DM Sans", sans-serif' }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-24 text-white"
      style={{ background: "#0e0118", fontFamily: '"DM Sans", sans-serif' }}
    >
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold" style={{ color: "#f5c842" }}>
            Social Tasks
          </h1>
          <p className="text-violet-200/90 text-lg max-w-xl leading-relaxed">
            Get paid to like, follow, comment and subscribe to brands
          </p>
        </header>

        {!isEliteOrHigher(membership) && (
          <Link
            href="/pricing"
            className="block rounded-xl border px-4 py-3 text-sm transition-colors"
            style={{ borderColor: "#7c3aed55", background: "rgba(124,58,237,0.12)", color: "#e9d5ff" }}
          >
            <span className="font-semibold" style={{ color: "#f5c842" }}>
              Upgrade to earn more per task
            </span>
            <span className="text-violet-200/80"> — view membership on Pricing</span>
          </Link>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Tasks available", value: String(stats.tasksAvailable) },
            {
              label: "Your earnings today",
              value: `${localeInt(stats.earningsTodayGpc)} GPC`,
            },
            { label: "Tasks completed today", value: String(stats.tasksCompletedToday) },
            { label: "Your membership tier", value: tierLabel },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 text-center"
            >
              <p className="text-[10px] uppercase tracking-wider text-violet-400/70 mb-1">{card.label}</p>
              <p className="text-lg font-bold font-mono" style={{ color: "#f5c842" }}>
                {card.value}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPlatformFilter(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                platformFilter === key
                  ? "text-black"
                  : "bg-white/5 text-violet-200/80 border border-white/10"
              }`}
              style={
                platformFilter === key
                  ? { background: "#f5c842", boxShadow: "0 0 16px rgba(245,200,66,0.25)" }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {filteredTasks.length === 0 && (
            <p className="text-violet-300/60 text-center py-12">No tasks match this filter.</p>
          )}
          {filteredTasks.map((task) => {
            const existing = completionByTask.get(task.id);
            const progress = task.max_completions > 0 ? (task.completions / task.max_completions) * 100 : 0;
            const locked = !userMeetsMinTier(membership, task.min_tier);
            return (
              <article
                key={task.id}
                className="rounded-2xl border border-white/[0.08] bg-[#12081f]/80 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-violet-300/80 flex items-center gap-2">
                      <span>{platformEmoji(task.platform)}</span>
                      <span className="capitalize">{task.platform}</span>
                    </p>
                    <h2 className="text-lg font-semibold text-white mt-1">{task.title}</h2>
                    {task.description && (
                      <p className="text-sm text-violet-200/70 mt-1">{task.description}</p>
                    )}
                  </div>
                  <span
                    className="shrink-0 text-xs font-bold px-2 py-1 rounded-md capitalize"
                    style={{ background: "#7c3aed33", color: "#c4b5fd" }}
                  >
                    {task.task_type}
                  </span>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xl font-bold font-mono" style={{ color: "#f5c842" }}>
                    +{localeInt(task.reward_gpc)} GPC
                  </p>
                  {existing ? (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 text-violet-200">
                      {existing.status === "pending" && "Pending review"}
                      {existing.status === "approved" && "Approved"}
                      {existing.status === "rejected" && "Not approved"}
                    </span>
                  ) : locked ? (
                    <span className="text-xs text-amber-200/80">Requires {task.min_tier}+ tier</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openClaim(task)}
                      disabled={task.completions >= task.max_completions}
                      className="rounded-xl px-5 py-2.5 text-sm font-bold text-black disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: "linear-gradient(135deg, #f5c842, #d4a017)",
                        boxShadow: "0 0 20px rgba(245,200,66,0.25)",
                      }}
                    >
                      {task.completions >= task.max_completions ? "Filled" : "CLAIM TASK"}
                    </button>
                  )}
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-violet-400/70 mb-1">
                    <span>Spots filled</span>
                    <span>
                      {task.completions} / {task.max_completions}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, progress)}%`,
                        background: "linear-gradient(90deg, #7c3aed, #f5c842)",
                      }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <p className="text-center text-xs text-violet-500/60">
          Rewards are credited after admin approval. Submissions must be genuine.
        </p>
      </div>

      {modalTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
        >
          <div
            className="w-full max-w-md rounded-2xl border p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ borderColor: "#7c3aed44", background: "#12081f" }}
          >
            <h3 className="text-xl font-bold" style={{ color: "#f5c842" }}>
              {modalTask.title}
            </h3>

            {step === 1 && (
              <>
                <p className="text-sm text-violet-200/80">
                  <strong className="text-white">Step 1:</strong> Complete the action using the link below.
                </p>
                <a
                  href={modalTask.target_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center rounded-xl py-3 font-semibold text-black"
                  style={{ background: "#f5c842" }}
                >
                  Open task link
                </a>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full rounded-xl border border-violet-500/40 py-3 text-violet-100"
                >
                  Next
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-sm text-violet-200/80">
                  <strong className="text-white">Step 2:</strong> Paste a link to your proof (profile screenshot URL,
                  post URL, etc.).
                </p>
                <input
                  type="url"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-violet-500/50 outline-none focus:border-[#7c3aed]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 rounded-xl border border-white/15 py-3 text-violet-200"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    disabled={modalTask.proof_required && !proofUrl.trim()}
                    className="flex-1 rounded-xl py-3 font-semibold text-black disabled:opacity-40"
                    style={{ background: "#f5c842" }}
                  >
                    Next
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-sm text-violet-200/80">
                  <strong className="text-white">Step 3:</strong> Confirm your submission. We will review it shortly.
                </p>
                <ul className="text-xs text-violet-300/80 space-y-1 font-mono break-all">
                  <li>Reward: {localeInt(modalTask.reward_gpc)} GPC</li>
                  {proofUrl && <li>Proof: {proofUrl}</li>}
                </ul>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex-1 rounded-xl border border-white/15 py-3 text-violet-200"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitClaim()}
                    disabled={submitting}
                    className="flex-1 rounded-xl py-3 font-bold text-black disabled:opacity-50"
                    style={{ background: "#f5c842" }}
                  >
                    {submitting ? "Submitting…" : "Submit"}
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setModalTask(null)}
              className="w-full text-sm text-violet-500 hover:text-violet-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
