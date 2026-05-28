"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { localeInt } from "@/lib/format-number";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import { ActionButton } from "@/components/admin/ActionButton";

const API_BASE = getApiRoot();

type Tab = "pending" | "approved" | "flagged" | "depleted" | "rejected" | "all";

type VideoRow = {
  id: string;
  title: string;
  video_url: string;
  status: string;
  budget_gpc: number;
  spent_gpc: number;
  views_count: number;
  created_at: string;
  creator_id: string;
  users?: { email?: string } | null;
};

function AdminVideosInner() {
  const session = useAdminSession();
  const [tab, setTab] = useState<Tab>("pending");
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [watchStats, setWatchStats] = useState({ gpcLast24h: 0, gpcAllTime: 0 });
  const [watchPayoutGpc, setWatchPayoutGpc] = useState("10");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateMsg, setRateMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, settingsRes] = await Promise.all([
        fetch(`${API_BASE}/admin/videos?status=${tab}`, {
          credentials: "include",
          headers: adminApiHeaders(session),
        }),
        fetch(`${API_BASE}/admin/platform-settings`, {
          credentials: "include",
          headers: adminApiHeaders(session),
        }),
      ]);
      const listData = await listRes.json();
      if (!listRes.ok) throw new Error(listData.message ?? "Failed to load videos");
      setVideos(listData.videos ?? []);
      setWatchStats(listData.watchEarnStats ?? { gpcLast24h: 0, gpcAllTime: 0 });

      const settingsData = await settingsRes.json();
      if (settingsRes.ok && settingsData.watch_payout_gpc != null) {
        setWatchPayoutGpc(String(settingsData.watch_payout_gpc));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [session, tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchVideo(videoId: string, action: string) {
    setBusy(videoId + action);
    try {
      const res = await fetch(`${API_BASE}/admin/videos`, {
        method: "PATCH",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveWatchRate() {
    setRateMsg(null);
    const gpc = Math.floor(Number(watchPayoutGpc));
    if (!Number.isFinite(gpc) || gpc < 1) {
      setRateMsg("Enter a valid GPC amount (min 1)");
      return;
    }
    const res = await fetch(`${API_BASE}/admin/platform-settings`, {
      method: "PATCH",
      credentials: "include",
      headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify({ watch_payout_gpc: gpc }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRateMsg(data.message ?? "Save failed");
      return;
    }
    setRateMsg("Watch payout saved.");
  }

  const tabs: Tab[] = ["pending", "approved", "flagged", "depleted", "rejected", "all"];

  return (
    <div className="p-4 tablet:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Creator videos</h1>
        <p className="text-sm text-fintech-muted mt-1">
          Moderate the watch-only earn feed. Payouts are GPC via creditGpayIdempotent.
        </p>
      </div>

      <div className="card-lux p-4 grid gap-3 tablet:grid-cols-3 text-sm">
        <div>
          <p className="text-fintech-muted">Watch GPC paid (24h)</p>
          <p className="text-lg font-bold text-[#fde047]">{localeInt(watchStats.gpcLast24h)} GPC</p>
        </div>
        <div>
          <p className="text-fintech-muted">Watch GPC paid (all time)</p>
          <p className="text-lg font-bold text-white">{localeInt(watchStats.gpcAllTime)} GPC</p>
        </div>
        <div>
          <p className="text-fintech-muted mb-1">GPC per 30s watch</p>
          <div className="flex gap-2">
            <input
              value={watchPayoutGpc}
              onChange={(e) => setWatchPayoutGpc(e.target.value)}
              type="number"
              min={1}
              className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-white"
            />
            <ActionButton onClick={saveWatchRate} disabled={!!busy}>
              Save
            </ActionButton>
          </div>
          {rateMsg && <p className="text-xs text-fintech-muted mt-1">{rateMsg}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
              tab === t ? "bg-violet-600 text-white" : "bg-white/5 text-fintech-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-fintech-muted">Loading…</p>
      ) : videos.length === 0 ? (
        <p className="text-fintech-muted">No videos in this tab.</p>
      ) : (
        <ul className="space-y-3">
          {videos.map((v) => {
            const remaining = Math.max(0, v.budget_gpc - v.spent_gpc);
            return (
              <li key={v.id} className="card-lux p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-medium text-white">{v.title}</p>
                    <p className="text-xs text-fintech-muted">
                      {v.users?.email ?? v.creator_id} · {v.status} · {v.views_count} views
                    </p>
                    <p className="text-xs text-fintech-muted mt-1">
                      Budget {localeInt(v.budget_gpc)} GPC · Spent {localeInt(v.spent_gpc)} · Left{" "}
                      {localeInt(remaining)} GPC
                    </p>
                    <a
                      href={v.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-fintech-accent hover:underline mt-1 inline-block"
                    >
                      Open video
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {v.status === "pending" && (
                      <>
                        <ActionButton
                          onClick={() => patchVideo(v.id, "approve")}
                          disabled={busy != null}
                        >
                          Approve
                        </ActionButton>
                        <ActionButton
                          onClick={() => patchVideo(v.id, "reject")}
                          disabled={busy != null}
                        >
                          Reject
                        </ActionButton>
                      </>
                    )}
                    {v.status === "approved" && (
                      <>
                        <ActionButton
                          onClick={() => patchVideo(v.id, "flag")}
                          disabled={busy != null}
                        >
                          Flag
                        </ActionButton>
                        <ActionButton
                          onClick={() => patchVideo(v.id, "pause")}
                          disabled={busy != null}
                        >
                          Pause
                        </ActionButton>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function AdminVideosPage() {
  return (
    <AdminPageGate>
      <AdminVideosInner />
    </AdminPageGate>
  );
}
