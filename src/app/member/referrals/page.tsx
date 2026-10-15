"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createStagingMember } from "@/app/member/actions";
import { useMember } from "@/components/member/useMember";
import { formatLamports } from "@/lib/member-platform/economics";

function ReferralsWorkspace() {
  const params = useSearchParams();
  const invite = params.get("invite") ?? "";
  const { id, snapshot, ready, saveId, reload } = useMember();
  const [purchase, setPurchase] = useState("1");
  const [firstPurchase, setFirstPurchase] = useState(true);
  const [earning, setEarning] = useState("0");
  const [quote, setQuote] = useState<string>("");
  const [error, setError] = useState("");
  const [inviteNote, setInviteNote] = useState("");

  useEffect(() => {
    if (!invite) return;
    fetch(`/api/member-platform/invites?code=${encodeURIComponent(invite)}`).then((response) => response.json()).then((body) => {
      setInviteNote(body.active ? `Invite from @${body.handle}. Creating a profile attributes one direct referral. It does not pay a commission.` : "This invite code is not active.");
    }).catch(() => setInviteNote("The invite could not be checked."));
  }, [invite]);

  async function calculate(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch(`/api/member-platform/referrals/quote?purchase=${encodeURIComponent(purchase)}&earning=${encodeURIComponent(earning)}&prior=${firstPurchase ? "0" : "1"}`);
    const body = await response.json();
    if (!response.ok) { setQuote(""); setError(body.error ?? "The server could not calculate that quote."); return; }
    setQuote(`${body.sequence === "first" ? "First" : "Later"} qualifying purchase: advertiser commission ${formatLamports(body.commissionLamports)} SOL at ${body.advertiserBps / 100}%. Viewer keeps ${formatLamports(body.viewerLamports)} SOL. A separate ${formatLamports(body.viewerMatchLamports)} SOL match is reserved at ${body.viewerMatchBps / 100}%. This is an illustration. Payouts are off.`);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await createStagingMember({
      displayName: String(form.get("displayName") ?? ""),
      handle: String(form.get("handle") ?? ""),
      inviteCode: invite,
    });
    if (!result.ok) { setError(result.error); return; }
    await saveId(result.id);
    await reload();
  }

  if (!ready || !snapshot) return <p className="text-violet-200">Loading referrals…</p>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-amber-300">Referrals</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">Direct referrals only. The first qualifying advertiser purchase is 20%. Every later qualifying purchase is 10% for the life of that relationship. Verified advertising-view earnings have a separate 100% match that does not reduce the viewer’s reward. Refunds and fraud reviews can reverse an eligible commission. Nothing is paid.</p>
      </header>
      {inviteNote && <p className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">{inviteNote}</p>}
      {snapshot.profile ? (
        <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Your invite</h2>
          <p className="mt-2 break-all text-amber-200">{snapshot.profile.invitePath}</p>
          <p className="mt-2 text-sm text-violet-200">Wallet invites use /join. Legacy /r links still go to registration and are unchanged.</p>
          <button type="button" className="mt-4 rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black" onClick={() => navigator.clipboard.writeText(window.location.origin + snapshot.profile!.invitePath)}>Copy invite link</button>
        </section>
      ) : (
        <form onSubmit={create} className="grid gap-3 rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Attribute this invite</h2>
          <label className="grid gap-1 text-sm">Display name<input name="displayName" required maxLength={40} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
          <label className="grid gap-1 text-sm">Handle<input name="handle" required minLength={3} maxLength={24} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
          <button type="submit" className="rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black">Create profile with this invite</button>
        </form>
      )}
      <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Direct referrals</h2>
        {snapshot.referrals.direct.length === 0 ? <p className="mt-3 text-sm text-violet-200">No direct referrals yet.</p> : (
          <ul className="mt-3 space-y-2">
            {snapshot.referrals.direct.map((item) => <li key={item.handle} className="text-sm text-violet-100">@{item.handle} · {item.verified ? "Verified" : "Unverified"} · not payable</li>)}
          </ul>
        )}
        <p className="mt-3 text-sm text-violet-300">{snapshot.referrals.historyNote}</p>
      </section>
      <form onSubmit={calculate} className="grid gap-3 rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Referral calculator</h2>
        <label className="grid gap-1 text-sm">Qualifying purchase (SOL)<input value={purchase} onChange={(event) => setPurchase(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
        <label className="grid gap-1 text-sm">Eligible verified-view earning (SOL)<input value={earning} onChange={(event) => setEarning(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={firstPurchase} onChange={(event) => setFirstPurchase(event.target.checked)} /> This is the first qualifying purchase for this referral</label>
        <button type="submit" className="w-fit rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black">Calculate on the server</button>
        {quote && <p className="text-sm leading-6 text-violet-100">{quote}</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
      </form>
    </div>
  );
}

export default function ReferralsPage() {
  return <Suspense fallback={<p className="text-violet-200">Loading referrals…</p>}><ReferralsWorkspace /></Suspense>;
}
