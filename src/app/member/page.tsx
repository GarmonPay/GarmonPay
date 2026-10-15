"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createStagingMember, saveMemberProfile } from "@/app/member/actions";
import { useMember } from "@/components/member/useMember";

export default function MemberDashboardPage() {
  const { id, snapshot, ready, error, saveId, reload } = useMember();
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const form = new FormData(event.currentTarget);
    const result = await createStagingMember({
      displayName: String(form.get("displayName") ?? ""),
      handle: String(form.get("handle") ?? ""),
      inviteCode: String(form.get("inviteCode") ?? ""),
    });
    if (!result.ok) { setFormError(result.error); return; }
    await saveId(result.id);
    setMessage("Staging profile saved on this server. It is not a funded wallet.");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    setFormError("");
    const form = new FormData(event.currentTarget);
    const result = await saveMemberProfile({
      memberId: id,
      displayName: String(form.get("displayName") ?? ""),
      biography: String(form.get("biography") ?? ""),
      profilePublic: form.get("profilePublic") === "on",
    });
    if (!result.ok) { setFormError(result.error); return; }
    await reload();
    setMessage("Profile updated.");
  }

  if (!ready || !snapshot) {
    return <p className="text-violet-200">{error || "Loading your member workspace…"}</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-violet-300">Your member dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-amber-300">{snapshot.profile ? snapshot.profile.displayName : "Welcome"}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">
          {snapshot.identity.note} Production membership uses a signed wallet. This page does not create that session.
        </p>
      </header>

      {!snapshot.profile && (
        <form onSubmit={createProfile} className="grid gap-3 rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Create a staging profile</h2>
          <p className="text-sm text-violet-200">New profiles receive 10 virtual SOL for paper trading after they are created. That amount is not issued until you save this form.</p>
          <label className="grid gap-1 text-sm">Display name<input name="displayName" required maxLength={40} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
          <label className="grid gap-1 text-sm">Handle<input name="handle" required minLength={3} maxLength={24} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
          <label className="grid gap-1 text-sm">Invite code, optional<input name="inviteCode" maxLength={32} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
          {formError && <p className="text-sm text-red-300">{formError}</p>}
          <button type="submit" className="rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black">Save staging profile</button>
        </form>
      )}

      {snapshot.profile && (
        <form onSubmit={saveProfile} className="grid gap-3 rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Profile</h2>
          <p className="text-sm text-violet-200">@{snapshot.profile.handle} · {snapshot.profile.verified ? "Verified" : "Unverified staging profile"} · {snapshot.profile.followers} followers</p>
          <label className="grid gap-1 text-sm">Display name<input name="displayName" defaultValue={snapshot.profile.displayName} required maxLength={40} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
          <label className="grid gap-1 text-sm">Biography<textarea name="biography" defaultValue={snapshot.profile.biography} maxLength={280} className="min-h-24 rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="profilePublic" defaultChecked={snapshot.profile.profilePublic} /> Show my profile and activity publicly</label>
          <button type="submit" className="w-fit rounded-xl border border-amber-300/40 px-4 py-3 text-amber-200">Update profile</button>
        </form>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-[#150d24] p-4">
          <h2 className="text-sm uppercase tracking-wide text-violet-300">Earnings</h2>
          <p className="mt-3 text-2xl font-semibold">No funded balance</p>
          <p className="mt-2 text-sm leading-6 text-violet-200">{snapshot.earnings.note}</p>
          <p className="mt-2 text-sm text-violet-100">Eligible advertiser commission recorded: {snapshot.earnings.eligibleCommissionSol === null ? "No profile" : `${snapshot.earnings.eligibleCommissionSol} SOL accounting units, not paid`}</p>
          <p className="mt-2 text-sm text-violet-100">Server-verified views: {snapshot.earnings.verifiedViews ?? "—"}</p>
          <p className="mt-2 text-sm text-amber-100">Withdrawals are paused. No withdrawal balance is shown.</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-[#150d24] p-4">
          <h2 className="text-sm uppercase tracking-wide text-violet-300">Referrals</h2>
          <p className="mt-3 text-2xl font-semibold">{snapshot.profile ? snapshot.referrals.direct.length : "—"}</p>
          <p className="mt-2 text-sm text-violet-200">Direct referrals. The first qualifying purchase is 20%. Later qualifying purchases are 10% for the life of the relationship. Viewer match is a separate 100%.</p>
          <Link href="/member/referrals" className="mt-4 inline-block text-amber-300">Open referrals</Link>
        </article>
        <article className="rounded-2xl border border-white/10 bg-[#150d24] p-4">
          <h2 className="text-sm uppercase tracking-wide text-violet-300">Advertising</h2>
          <p className="mt-3 text-2xl font-semibold">{snapshot.advertising.drafts} drafts</p>
          <p className="mt-2 text-sm text-violet-200">Prepaid packages only. No subscription and no charge.</p>
          <Link href="/member/advertising" className="mt-4 inline-block text-amber-300">Plan a campaign</Link>
        </article>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Activity</h2>
        {snapshot.activity.length === 0 ? <p className="mt-3 text-sm text-violet-200">No activity recorded for this profile.</p> : (
          <ul className="mt-3 space-y-2">
            {snapshot.activity.map((item) => <li key={item.at + item.text} className="text-sm text-violet-100">{item.text}</li>)}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-amber-300/20 bg-[#150d24] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-amber-200">Paper trading</h2>
        {snapshot.paper ? <p className="mt-2 text-sm text-violet-100">{snapshot.paper.cashSol} virtual SOL. This is not a real asset and cannot be withdrawn.</p> : <p className="mt-2 text-sm text-violet-200">A new staging profile starts with 10 virtual SOL. None is issued before you create a profile.</p>}
        <Link href="/member/paper" className="mt-3 inline-block text-amber-300">Open paper trading</Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {snapshot.shortcuts.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-2xl border border-white/10 bg-white/5 p-4 no-underline">
            <span className="block font-semibold text-white">{item.label}</span>
            <span className="mt-1 block text-sm text-violet-200">{item.detail}</span>
          </Link>
        ))}
      </section>
      {message && <p className="text-sm text-emerald-300">{message}</p>}
      {formError && snapshot.profile && <p className="text-sm text-red-300">{formError}</p>}
      <p className="text-sm text-violet-300">Existing GPC account stays separate. <Link href="/dashboard" className="text-amber-300">Open existing account</Link></p>
    </div>
  );
}
