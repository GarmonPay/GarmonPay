"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import { UsernameAvailabilityField } from "@/components/auth/UsernameAvailabilityField";
import { useUsernameAvailability } from "@/hooks/useUsernameAvailability";
import { validateUsernameFormat } from "@/lib/username-validation";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  membership: string | null;
  referral_code: string | null;
  username?: string;
  next_username_change_at?: string | null;
  limits?: {
    maxFullNameLen: number;
    maxAvatarUrlLen: number;
    editsPerHour: number;
  };
};

type HistRow = {
  old_username: string;
  new_username: string;
  changed_at: string;
  reason?: string | null;
};

function formatRpcDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
  }
  if (typeof raw === "object" && raw !== null && "value" in (raw as object)) {
    return formatRpcDate((raw as { value?: unknown }).value);
  }
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const supabase = useMemo(() => createBrowserClient(), []);
  const [usernameEditing, setUsernameEditing] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameErr, setUsernameErr] = useState<string | null>(null);
  const [usernameOk, setUsernameOk] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<HistRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { state: newUsernameAvailState } = useUsernameAvailability(supabase, newUsername, {
    excludeUserId: profile?.id ?? null,
  });

  const load = useCallback(async () => {
    setMessage(null);
    const session = await getSessionAsync();
    if (!session?.accessToken) {
      setLoading(false);
      setMessage({ type: "err", text: "Sign in to manage your profile." });
      return;
    }
    const res = await fetch("/api/profile", {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setMessage({ type: "err", text: (data as { error?: string }).error ?? "Could not load profile" });
      return;
    }
    const p = data as Profile;
    setProfile(p);
    setFullName(p.full_name ?? "");
    setAvatarUrl(p.avatar_url ?? "");
    setUsernameEditing(false);
    setNewUsername("");
    setUsernameErr(null);
    setUsernameOk(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function loadUsernameHistory() {
    setHistoryLoading(true);
    const session = await getSessionAsync();
    if (!session?.accessToken) {
      setHistoryLoading(false);
      return;
    }
    const res = await fetch("/api/account/username-history", {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setHistoryRows((j as { rows?: HistRow[] }).rows ?? []);
    }
    setHistoryLoading(false);
  }

  async function save() {
    setMessage(null);
    const session = await getSessionAsync();
    if (!session?.accessToken) {
      setMessage({ type: "err", text: "Session expired. Sign in again." });
      return;
    }
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ full_name: fullName, avatar_url: avatarUrl }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.status === 429) {
      const retry = (data as { retryAfterSec?: number }).retryAfterSec;
      setMessage({
        type: "err",
        text:
          (data as { error?: string }).error ??
          `Too many updates. Try again in ${retry != null ? `${retry}s` : "a bit"}.`,
      });
      return;
    }
    if (!res.ok) {
      setMessage({ type: "err", text: (data as { error?: string }).error ?? "Save failed" });
      return;
    }
    const prof = (data as { profile?: Profile }).profile;
    if (prof) {
      setProfile((prev) => (prev ? { ...prev, ...prof } : prof));
      setFullName(prof.full_name ?? "");
      setAvatarUrl(prof.avatar_url ?? "");
    }
    setMessage({ type: "ok", text: "Profile saved." });
  }

  async function saveUsername() {
    setUsernameErr(null);
    setUsernameOk(null);
    if (!supabase || !profile) {
      setUsernameErr("Not available.");
      return;
    }
    const session = await getSessionAsync();
    if (!session?.accessToken) {
      setUsernameErr("Session expired. Sign in again.");
      return;
    }
    const trimmed = newUsername.trim();
    const v = validateUsernameFormat(trimmed);
    if (!v.ok) {
      setUsernameErr(v.reason ?? "Invalid username");
      return;
    }
    if (newUsernameAvailState !== "available") {
      setUsernameErr("Please choose an available username.");
      return;
    }
    if (trimmed === (profile.username ?? "").trim()) {
      setUsernameErr("Choose a different username.");
      return;
    }

    setUsernameBusy(true);
    const { data, error } = await supabase.rpc("change_username", { p_new_username: trimmed });
    setUsernameBusy(false);

    if (error) {
      setUsernameErr(error.message);
      return;
    }

    const row = data as {
      success?: boolean;
      message?: string;
      next_change_available_at?: unknown;
    } | null;

    if (!row?.success) {
      const when = formatRpcDate(row?.next_change_available_at);
      const suffix = when ? ` Next change available: ${when}.` : "";
      setUsernameErr((row?.message ?? "Could not change username.") + suffix);
      return;
    }

    setUsernameOk("Username changed.");
    setUsernameEditing(false);
    setNewUsername("");
    await load();
  }

  const maxName = profile?.limits?.maxFullNameLen ?? 120;
  const editsPerHour = profile?.limits?.editsPerHour ?? 8;

  const usernameLocked =
    !!profile?.next_username_change_at &&
    new Date(profile.next_username_change_at).getTime() > Date.now();

  const nextChangeLabel = profile?.next_username_change_at
    ? new Date(profile.next_username_change_at).toLocaleString()
    : null;

  const canSaveUsername =
    !!profile &&
    !usernameBusy &&
    !!supabase &&
    newUsernameAvailState === "available" &&
    validateUsernameFormat(newUsername.trim()).ok &&
    newUsername.trim() !== (profile.username ?? "").trim();

  return (
    <div className="space-y-4 tablet:space-y-6">
      <div className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
        <h1 className="text-xl font-bold text-white mb-2">Settings</h1>
        <p className="text-fintech-muted mb-6">Account and profile.</p>

        <div className="rounded-lg bg-black/20 border border-white/10 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-white">Profile</h2>
          <p className="text-xs text-fintech-muted">
            You can change your display name and avatar link. Email and referral code cannot be edited here. Limit:{" "}
            {editsPerHour} saves per hour.
          </p>

          {loading ? (
            <p className="text-sm text-fintech-muted">Loading…</p>
          ) : (
            <>
              {profile?.email ? (
                <div>
                  <label className="block text-xs font-medium text-fintech-muted mb-1">Email</label>
                  <p className="text-sm text-white/90">{profile.email}</p>
                </div>
              ) : null}

              {profile?.referral_code ? (
                <div>
                  <label className="block text-xs font-medium text-fintech-muted mb-1">Referral code</label>
                  <p className="text-sm font-mono text-emerald-400/90">{profile.referral_code}</p>
                </div>
              ) : null}

              <div>
                <label htmlFor="full_name" className="block text-xs font-medium text-fintech-muted mb-1">
                  Display name
                </label>
                <input
                  id="full_name"
                  type="text"
                  autoComplete="name"
                  maxLength={maxName}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                  placeholder="Your name"
                />
                <p className="mt-1 text-[11px] text-fintech-muted">{fullName.length}/{maxName}</p>
              </div>

              <div>
                <label htmlFor="avatar_url" className="block text-xs font-medium text-fintech-muted mb-1">
                  Avatar image URL
                </label>
                <input
                  id="avatar_url"
                  type="url"
                  inputMode="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                  placeholder="https://…"
                />
                <p className="mt-1 text-[11px] text-fintech-muted">HTTPS recommended. Leave empty to clear.</p>
              </div>

              {message ? (
                <div
                  role="alert"
                  className={
                    message.type === "ok"
                      ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
                      : "rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                  }
                >
                  {message.text}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
            </>
          )}
        </div>

        <div className="mt-4 rounded-lg bg-black/20 border border-[#7c3aed]/25 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white">Username</h2>
          <p className="text-xs text-fintech-muted">
            You can change your username once every 30 days. Your old username will be locked for 30 days after the
            change to reduce impersonation.
          </p>

          {!loading && profile ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-2xl font-semibold text-[#f5c842] tracking-tight">
                  {profile.username?.trim() || "—"}
                </p>
                {usernameLocked ? (
                  <span className="text-xs text-white/60">
                    Next change available: <span className="text-[#f5c842]/90">{nextChangeLabel}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setUsernameEditing((e) => !e);
                      setUsernameErr(null);
                      setUsernameOk(null);
                      setNewUsername("");
                    }}
                    className="rounded-lg border border-[#7c3aed]/50 bg-[#7c3aed]/15 px-3 py-1.5 text-xs font-medium text-[#c4b5fd] hover:bg-[#7c3aed]/25"
                  >
                    {usernameEditing ? "Close" : "Change"}
                  </button>
                )}
              </div>

              {usernameEditing && supabase ? (
                <div className="space-y-3 border-t border-white/10 pt-3">
                  <UsernameAvailabilityField
                    supabase={supabase}
                    value={newUsername}
                    onChange={setNewUsername}
                    excludeUserId={profile.id}
                    disabled={usernameBusy}
                    id="settings_new_username"
                    label="New username"
                  />
                  {usernameErr ? (
                    <p className="text-xs text-red-300" role="alert">
                      {usernameErr}
                    </p>
                  ) : null}
                  {usernameOk ? (
                    <p className="text-xs text-[#f5c842]" role="status">
                      {usernameOk}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveUsername()}
                      disabled={!canSaveUsername}
                      className="rounded-lg bg-[#f5c842] px-4 py-2 text-sm font-semibold text-[#0e0118] hover:bg-[#e6b93d] disabled:opacity-45"
                    >
                      {usernameBusy ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUsernameEditing(false);
                        setNewUsername("");
                        setUsernameErr(null);
                      }}
                      disabled={usernameBusy}
                      className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/90 hover:bg-white/5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <details
                className="rounded-lg border border-white/10 bg-black/20"
                onToggle={(e) => {
                  if ((e.target as HTMLDetailsElement).open) void loadUsernameHistory();
                }}
              >
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-white/70 hover:text-white">
                  Username history
                </summary>
                <div className="border-t border-white/10 px-3 py-2">
                  {historyLoading ? (
                    <p className="text-xs text-white/50">Loading…</p>
                  ) : historyRows.length === 0 ? (
                    <p className="text-xs text-white/50">No prior changes yet.</p>
                  ) : (
                    <ul className="max-h-48 space-y-2 overflow-y-auto text-xs text-white/80">
                      {historyRows.map((r) => (
                        <li key={`${r.changed_at}-${r.old_username}-${r.new_username}`} className="border-b border-white/5 pb-2">
                          <span className="text-[#f5c842]/90">{r.old_username}</span>
                          <span className="mx-1 text-white/40">→</span>
                          <span className="text-emerald-300/90">{r.new_username}</span>
                          <span className="ml-2 text-white/45">
                            {new Date(r.changed_at).toLocaleString()}
                            {r.reason ? ` · ${r.reason}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            </>
          ) : null}
        </div>

        <div className="mt-4 rounded-lg bg-black/20 border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-white mb-2">Security</h2>
          <p className="text-sm text-fintech-muted">
            Use “Forgot password” on the login page to reset your password. More security options may be added here
            later.
          </p>
        </div>
      </div>
    </div>
  );
}
