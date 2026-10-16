"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { saveMemberProfile } from "@/app/member/actions";
import { WalletSignIn } from "@/components/solana/WalletSignIn";
import { useMember } from "@/components/member/useMember";

export default function MemberDashboardPage() {
  const { id, snapshot, ready, error, reload } = useMember();
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    setFormError("");
    const form = new FormData(event.currentTarget);
    try {
    const result = await saveMemberProfile({
      memberId: id,
      displayName: String(form.get("displayName") ?? ""),
      biography: String(form.get("biography") ?? ""),
      walletPublic: form.get("walletPublic") === "on",
      handle: String(form.get("handle") ?? ""),
    });
    if (!result.ok) { setFormError(result.error); return; }
    await reload();
    setMessage("Profile saved for this signed wallet.");
    } catch { setFormError("The save response could not be confirmed. Refresh your profile before retrying."); }
  }

  if (!ready || !snapshot) {
    return <p className="text-violet-200">{error || "Loading your member workspace…"}</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-violet-300">Your member dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-amber-300">{snapshot.profile ? snapshot.profile.displayName : "Welcome"}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">{snapshot.identity.note}</p>
      </header>

      <details className="gp-member-signin"><summary>Connect to your member workspace</summary><WalletSignIn /></details>

      {!snapshot.walletConnected && (
        <p className="rounded-2xl border border-white/10 bg-[#150d24] p-4 text-sm text-violet-100">Sign in above to open your profile, referrals, and paper trading. Nothing on this page accepts a saved browser ID as a member.</p>
      )}

      {snapshot.profile && (
        <form onSubmit={saveProfile} className="grid gap-3 rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Profile</h2>
          <Link href="/solana/members" className="text-sm text-amber-300">Edit profile photo in your member profile</Link>
          <p className="text-sm text-violet-200">@{snapshot.profile.handle} · Signed wallet · {snapshot.profile.followers} followers</p>
          <label className="grid gap-1 text-sm">Display name<input name="displayName" defaultValue={snapshot.profile.displayName === "Member" ? "" : snapshot.profile.displayName} maxLength={32} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
          <label className="grid gap-1 text-sm">Public handle<input name="handle" placeholder={snapshot.profile.handle} maxLength={24} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /><span className="text-xs text-violet-200">A public username can change once every seven days. The signed wallet stays the account.</span></label>
          <label className="grid gap-1 text-sm">Biography<textarea name="biography" defaultValue={snapshot.profile.biography} maxLength={280} className="min-h-24 rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="walletPublic" defaultChecked={snapshot.profile.profilePublic} /> Show my wallet address on the public Solana directory</label>
          {formError && <p className="text-sm text-red-300">{formError}</p>}
          {message && <p className="text-sm text-emerald-300">{message}</p>}
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
          <p className="mt-2 text-sm text-violet-200">Direct referrals stay with the signed wallet. The current code records 10% then 5% for advertisers and a separate 50% viewer match. Nothing is paid.</p>
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
        {snapshot.paper ? <p className="mt-2 text-sm text-violet-100">{snapshot.paper.cashSol} virtual SOL. This is not a real asset and cannot be withdrawn.</p> : <p className="mt-2 text-sm text-violet-200">{snapshot.walletConnected ? "10 virtual SOL is issued when the reviewed paper ledger is approved. None is stored yet, and none of it is real SOL." : "The planned paper account starts with 10 virtual SOL after ledger activation. No virtual balance has been issued here."}</p>}
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
      <p className="text-sm text-violet-300">Older email accounts stay separate. <Link href="/dashboard" className="text-amber-300">Open existing account</Link></p>
    </div>
  );
}
