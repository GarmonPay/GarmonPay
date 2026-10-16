"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMember } from "@/components/member/useMember";
import { formatLamports } from "@/lib/member-platform/economics";

function ReferralsWorkspace() {
  const params = useSearchParams();
  const invite = params.get("invite") ?? "";
  const { snapshot, ready, error: loadError } = useMember();
  const [purchase, setPurchase] = useState("1");
  const [firstPurchase, setFirstPurchase] = useState(true);
  const [earning, setEarning] = useState("0");
  const [quote, setQuote] = useState<string>("");
  const [error, setError] = useState("");
  const [inviteNote, setInviteNote] = useState("");

  useEffect(() => {
    if (!invite) return;
    fetch(`/api/member-platform/invites?code=${encodeURIComponent(invite)}`).then((response) => response.json()).then((body) => {
      setInviteNote(body.active ? `Invite from @${body.handle}. Sign in with your wallet on My Dashboard. A new wallet keeps this referrer. It does not pay a commission.` : "This invite code is not active.");
    }).catch(() => setInviteNote("The invite could not be checked."));
  }, [invite]);

  async function calculate(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
    const response = await fetch(`/api/member-platform/referrals/quote?purchase=${encodeURIComponent(purchase)}&earning=${encodeURIComponent(earning)}&prior=${firstPurchase ? "0" : "1"}`, { signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    if (!response.ok) { setQuote(""); setError(body.error ?? "The server could not calculate that quote."); return; }
    setQuote(`${body.sequence === "first" ? "First" : "Later"} qualifying purchase: advertiser commission ${formatLamports(body.commissionLamports)} SOL at ${body.advertiserBps / 100}%. Viewer keeps ${formatLamports(body.viewerLamports)} SOL. A separate ${formatLamports(body.viewerMatchLamports)} SOL match is reserved at ${body.viewerMatchBps / 100}%. This is an illustration. Payouts are off.`);
    } catch { setQuote(""); setError("The referral calculator could not be reached. Nothing was recorded or paid."); }
  }

  if (!ready) return <p className="text-violet-200">Loading referrals…</p>;
  if (!snapshot) return <p className="text-violet-200">{loadError || "Referrals could not be loaded."}</p>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-amber-300">Referrals</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">Direct referrals only. The current code records 10% on the first eligible advertiser purchase and 5% after that, plus a separate 50% lifetime match on eligible verified advertising-view earnings. Refunds and fraud reviews can reverse an eligible commission. Nothing is paid.</p>
      </header>
      {inviteNote && <p className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">{inviteNote}</p>}
      {snapshot.profile ? (
        <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Your invite</h2>
          <p className="mt-2 break-all text-amber-200">{snapshot.profile.invitePath}</p>
          <p className="mt-2 text-sm text-violet-200">This link opens wallet sign-in. The referrer is stored only when that wallet is new. Legacy /r links still go to registration.</p>
          <button type="button" className="mt-4 rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black" onClick={() => navigator.clipboard.writeText(window.location.origin + snapshot.profile!.invitePath)}>Copy invite link</button>
        </section>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-[#150d24] p-4 text-sm text-violet-100">Connect and sign in on My Dashboard to see your invite link. Referral ownership is stored with that signed wallet, and nothing is paid.</p>
      )}
      <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Your referral record</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-violet-300">Referred wallets</dt><dd>{snapshot.profile ? snapshot.referralTotal ?? snapshot.referrals.direct.length : "Sign in required"}</dd></div>
          <div><dt className="text-violet-300">Payable advertiser verifications</dt><dd>{snapshot.referrals.direct.filter((item) => item.verified).length} recorded</dd></div>
          <div><dt className="text-violet-300">Eligible advertiser commission</dt><dd>{snapshot.earnings.eligibleCommissionSol === null ? "No profile" : `${snapshot.earnings.eligibleCommissionSol} SOL accounting units`}</dd></div>
          <div><dt className="text-violet-300">Viewer-match earnings</dt><dd>None recorded. Verified ad views are not funded.</dd></div>
          <div><dt className="text-violet-300">Pending</dt><dd>{snapshot.payoutsEnabled ? "Payout review is closed." : "Nothing is pending payment. Payouts are paused."}</dd></div>
          <div><dt className="text-violet-300">Paid</dt><dd>None. No referral payout has been sent.</dd></div>
        </dl>
        <p className="mt-3 text-sm text-violet-200">Advertiser commissions and the 50% viewer match stay separate. A username change does not move these records, because they belong to the member id behind the signed wallet.</p>
      </section>
      <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Referral activity</h2>
        {snapshot.referrals.direct.length === 0 ? <p className="mt-3 text-sm text-violet-200">No direct referrals yet.</p> : (
          <ul className="mt-3 space-y-2">
            {snapshot.referrals.direct.map((item) => <li key={item.handle} className="text-sm text-violet-100">{item.at ? new Date(item.at).toLocaleString() : "Date unavailable"} · @{item.handle} · wallet signed in · {item.verified ? "payable verification recorded" : "not payable"}</li>)}
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
