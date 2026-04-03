"use client";

import { useCallback, useEffect, useState } from "react";
import { getSessionAsync } from "@/lib/session";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  membership: string | null;
  referral_code: string | null;
  limits?: {
    maxFullNameLen: number;
    maxAvatarUrlLen: number;
    editsPerHour: number;
  };
};

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const maxName = profile?.limits?.maxFullNameLen ?? 120;
  const editsPerHour = profile?.limits?.editsPerHour ?? 8;

  return (
    <div className="space-y-4 tablet:space-y-6">
      <div className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
        <h1 className="text-xl font-bold text-white mb-2">Settings</h1>
        <p className="text-fintech-muted mb-6">Account and profile.</p>

        <div className="rounded-lg bg-black/20 border border-white/10 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-white">Profile</h2>
          <p className="text-xs text-fintech-muted">
            You can change your display name and avatar link. Email and referral code cannot be edited here.
            {" "}
            Limit: {editsPerHour} saves per hour.
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

        <div className="mt-4 rounded-lg bg-black/20 border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-white mb-2">Security</h2>
          <p className="text-sm text-fintech-muted">
            Use “Forgot password” on the login page to reset your password. More security options may be added
            here later.
          </p>
        </div>
      </div>
    </div>
  );
}
