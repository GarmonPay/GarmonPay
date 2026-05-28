"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { buildTargetDemo, targetDemoFromRow } from "@/lib/creator-videos-fields";
import { localeInt } from "@/lib/format-number";
import type { TargetDemo } from "@/lib/watch-earn";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import { ActionButton } from "@/components/admin/ActionButton";

const API_BASE = getApiRoot();

type Tab = "pending" | "approved" | "flagged" | "depleted" | "rejected" | "all";

type CreatorRef = { email?: string | null; username?: string | null } | null;

type VideoRow = {
  id: string;
  title: string;
  video_url: string;
  thumbnail_url?: string | null;
  target_demo?: TargetDemo | null;
  status: string;
  budget_gpc: number;
  spent_gpc: number;
  views_count: number;
  created_at: string;
  creator_id: string | null;
  creator?: CreatorRef;
  users?: CreatorRef;
};

type UserOption = {
  id: string;
  email: string | null;
  username?: string | null;
};

type VideoFormFields = {
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  budgetGpc: string;
  ageMin: string;
  ageMax: string;
  gender: string;
  interests: string;
};

const EMPTY_FORM: VideoFormFields = {
  title: "",
  videoUrl: "",
  thumbnailUrl: "",
  budgetGpc: "500",
  ageMin: "",
  ageMax: "",
  gender: "",
  interests: "",
};

const inputClass =
  "mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white";
const labelClass = "text-xs text-fintech-muted";

function creatorLabel(v: VideoRow): string {
  const ref = v.creator ?? v.users;
  if (ref?.email) return ref.email;
  if (ref?.username) return `@${ref.username}`;
  if (v.creator_id) return v.creator_id;
  return "platform-uploaded";
}

function VideoFieldForm({
  fields,
  setFields,
  readOnlyStats,
}: {
  fields: VideoFormFields;
  setFields: React.Dispatch<React.SetStateAction<VideoFormFields>>;
  readOnlyStats?: { spent_gpc: number; views_count: number };
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Title</label>
        <input
          value={fields.title}
          onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
          required
          maxLength={120}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Video URL (https)</label>
        <input
          value={fields.videoUrl}
          onChange={(e) => setFields((f) => ({ ...f, videoUrl: e.target.value }))}
          required
          type="url"
          placeholder="https://..."
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Thumbnail URL (optional)</label>
        <input
          value={fields.thumbnailUrl}
          onChange={(e) => setFields((f) => ({ ...f, thumbnailUrl: e.target.value }))}
          type="url"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Budget (GPC)</label>
        <input
          value={fields.budgetGpc}
          onChange={(e) => setFields((f) => ({ ...f, budgetGpc: e.target.value }))}
          required
          type="number"
          min={10}
          className={inputClass}
        />
      </div>
      {readOnlyStats && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <p className={labelClass}>Spent GPC (read-only)</p>
            <p className="text-white font-medium">{localeInt(readOnlyStats.spent_gpc)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <p className={labelClass}>Views (read-only)</p>
            <p className="text-white font-medium">{localeInt(readOnlyStats.views_count)}</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Target age min (optional)</label>
          <input
            value={fields.ageMin}
            onChange={(e) => setFields((f) => ({ ...f, ageMin: e.target.value }))}
            type="number"
            min={13}
            max={99}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Target age max (optional)</label>
          <input
            value={fields.ageMax}
            onChange={(e) => setFields((f) => ({ ...f, ageMax: e.target.value }))}
            type="number"
            min={13}
            max={99}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Target gender (optional)</label>
        <input
          value={fields.gender}
          onChange={(e) => setFields((f) => ({ ...f, gender: e.target.value }))}
          placeholder="e.g. female, male, all"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Target interests (optional, comma-separated)</label>
        <input
          value={fields.interests}
          onChange={(e) => setFields((f) => ({ ...f, interests: e.target.value }))}
          placeholder="music, gaming, fitness"
          className={inputClass}
        />
      </div>
    </div>
  );
}

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

  const [editVideo, setEditVideo] = useState<VideoRow | null>(null);
  const [editFields, setEditFields] = useState<VideoFormFields>(EMPTY_FORM);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addFields, setAddFields] = useState<VideoFormFields>(EMPTY_FORM);
  const [addStatus, setAddStatus] = useState<"pending" | "approved" | "flagged">("pending");
  const [addCreatorId, setAddCreatorId] = useState("");
  const [creatorSearch, setCreatorSearch] = useState("");
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);

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

  const loadUsers = useCallback(async () => {
    if (usersLoaded) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(
          (data.users ?? []).map((u: UserOption) => ({
            id: u.id,
            email: u.email,
            username: u.username,
          }))
        );
        setUsersLoaded(true);
      }
    } catch {
      /* optional for add form */
    }
  }, [session, usersLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (showAdd) loadUsers();
  }, [showAdd, loadUsers]);

  const filteredUsers = useMemo(() => {
    const q = creatorSearch.trim().toLowerCase();
    if (!q) return users.slice(0, 50);
    return users
      .filter((u) => {
        const email = (u.email ?? "").toLowerCase();
        const username = (u.username ?? "").toLowerCase();
        const id = u.id.toLowerCase();
        return email.includes(q) || username.includes(q) || id.includes(q);
      })
      .slice(0, 50);
  }, [users, creatorSearch]);

  function openEdit(v: VideoRow) {
    const demo = targetDemoFromRow(v.target_demo);
    setEditVideo(v);
    setEditFields({
      title: v.title,
      videoUrl: v.video_url,
      thumbnailUrl: v.thumbnail_url ?? "",
      budgetGpc: String(v.budget_gpc),
      ...demo,
    });
    setEditMsg(null);
    setEditErr(null);
  }

  function openAdd() {
    setAddFields({ ...EMPTY_FORM });
    setAddStatus("pending");
    setAddCreatorId("");
    setCreatorSearch("");
    setAddMsg(null);
    setAddErr(null);
    setShowAdd(true);
  }

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

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editVideo) return;
    setEditBusy(true);
    setEditMsg(null);
    setEditErr(null);
    try {
      const res = await fetch(`${API_BASE}/admin/videos/${editVideo.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editFields.title,
          videoUrl: editFields.videoUrl,
          thumbnailUrl: editFields.thumbnailUrl || undefined,
          budgetGpc: Number(editFields.budgetGpc),
          targetDemo: buildTargetDemo(editFields),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Save failed");
      setEditMsg("Video updated.");
      await load();
      setTimeout(() => setEditVideo(null), 600);
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEditBusy(false);
    }
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddBusy(true);
    setAddMsg(null);
    setAddErr(null);
    try {
      const res = await fetch(`${API_BASE}/admin/videos`, {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addFields.title,
          videoUrl: addFields.videoUrl,
          thumbnailUrl: addFields.thumbnailUrl || undefined,
          budgetGpc: Number(addFields.budgetGpc),
          targetDemo: buildTargetDemo(addFields),
          status: addStatus,
          creatorId: addCreatorId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed");
      setAddMsg("Video added.");
      await load();
      setTimeout(() => setShowAdd(false), 600);
    } catch (err) {
      setAddErr(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAddBusy(false);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Creator videos</h1>
          <p className="text-sm text-fintech-muted mt-1">
            Moderate the watch-only earn feed. Payouts are GPC via creditGpayIdempotent.
          </p>
        </div>
        <ActionButton onClick={openAdd} variant="gold" className="!text-[#0e0118]">
          Add Video
        </ActionButton>
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
                      {creatorLabel(v)} · {v.status} · {v.views_count} views
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
                    <ActionButton onClick={() => openEdit(v)} disabled={busy != null}>
                      Edit
                    </ActionButton>
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

      {editVideo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={saveEdit}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[#7c3aed]/30 bg-[#0e0118] p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-[#f5c842]">Edit video</h2>
            <p className="mt-1 text-sm text-white/60">{editVideo.title}</p>
            <div className="mt-4">
              <VideoFieldForm
                fields={editFields}
                setFields={setEditFields}
                readOnlyStats={{ spent_gpc: editVideo.spent_gpc, views_count: editVideo.views_count }}
              />
            </div>
            {editErr && <p className="mt-3 text-sm text-red-400">{editErr}</p>}
            {editMsg && <p className="mt-3 text-sm text-emerald-300">{editMsg}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditVideo(null)}
                className="rounded-lg border border-white/20 px-4 py-2 text-white"
              >
                Cancel
              </button>
              <ActionButton type="submit" disabled={editBusy} variant="gold" className="!text-[#0e0118]">
                {editBusy ? "Saving…" : "Save"}
              </ActionButton>
            </div>
          </form>
        </div>
      )}

      {showAdd && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={submitAdd}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[#7c3aed]/30 bg-[#0e0118] p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-[#f5c842]">Add video</h2>
            <p className="mt-1 text-sm text-white/60">
              Upload on behalf of a creator or leave creator blank for platform-uploaded.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className={labelClass}>Set status</label>
                <select
                  value={addStatus}
                  onChange={(e) =>
                    setAddStatus(e.target.value as "pending" | "approved" | "flagged")
                  }
                  className={inputClass}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="flagged">Flagged</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Creator (optional)</label>
                <input
                  value={creatorSearch}
                  onChange={(e) => setCreatorSearch(e.target.value)}
                  placeholder="Search by email, username, or id…"
                  className={inputClass}
                />
                <select
                  value={addCreatorId}
                  onChange={(e) => setAddCreatorId(e.target.value)}
                  className={`${inputClass} mt-2`}
                >
                  <option value="">Platform-uploaded (no creator)</option>
                  {filteredUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email ?? u.username ?? u.id}
                      {u.username && u.email ? ` (@${u.username})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <VideoFieldForm fields={addFields} setFields={setAddFields} />
            </div>
            {addErr && <p className="mt-3 text-sm text-red-400">{addErr}</p>}
            {addMsg && <p className="mt-3 text-sm text-emerald-300">{addMsg}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-white/20 px-4 py-2 text-white"
              >
                Cancel
              </button>
              <ActionButton type="submit" disabled={addBusy} variant="gold" className="!text-[#0e0118]">
                {addBusy ? "Uploading…" : "Add video"}
              </ActionButton>
            </div>
          </form>
        </div>
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
