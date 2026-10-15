"use client";

import { useEffect, useState } from "react";
import { followHandle } from "@/app/member/actions";
import { useMember } from "@/components/member/useMember";

export default function PublicProfilePage({ params }: { params: { handle: string } }) {
  const { id } = useMember();
  const [profile, setProfile] = useState<{ displayName: string; handle: string; biography: string; followers: number; following: number; isFollowing: boolean; profilePublic: boolean; privateNote: string | null; activity: { text: string; at: string }[] } | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const headers: Record<string, string> = {};
    if (id) headers["x-member-staging-id"] = id;
    const response = await fetch(`/api/member-platform/directory?handle=${encodeURIComponent(params.handle)}`, { headers, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "This profile is unavailable."); return; }
    setProfile(body);
  }

  useEffect(() => { void load(); }, [params.handle, id]);

  async function toggle() {
    if (!id || !profile) { setError("Create a staging profile before following."); return; }
    const result = await followHandle({ memberId: id, handle: profile.handle, follow: !profile.isFollowing });
    if (!result.ok) { setError(result.error); return; }
    await load();
  }

  if (error && !profile) return <p className="text-red-300">{error}</p>;
  if (!profile) return <p className="text-violet-200">Loading profile…</p>;
  return (
    <article className="space-y-4 rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
      <h1 className="text-3xl font-semibold text-amber-300">{profile.displayName}</h1>
      <p className="text-violet-200">@{profile.handle} · {profile.followers} followers · {profile.following} following</p>
      {profile.profilePublic ? <p className="text-sm leading-6 text-violet-100">{profile.biography || "No biography yet."}</p> : <p className="text-sm text-violet-200">{profile.privateNote}</p>}
      <button type="button" className="rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black" onClick={() => void toggle()}>{profile.isFollowing ? "Unfollow" : "Follow"}</button>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <h2 className="text-lg font-semibold">Activity</h2>
      {profile.activity.length === 0 ? <p className="text-sm text-violet-200">No public activity.</p> : profile.activity.map((item) => <p key={item.at + item.text} className="text-sm text-violet-100">{item.text}</p>)}
    </article>
  );
}
