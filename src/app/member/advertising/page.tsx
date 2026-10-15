"use client";

import { FormEvent, useState } from "react";
import { saveAdvertisingDraft } from "@/app/member/actions";
import { useMember } from "@/components/member/useMember";
import { ADVERTISING_TIERS } from "@/lib/member-platform/advertising";
import { formatLamports } from "@/lib/member-platform/economics";

function dollars(micro: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(micro) / 1_000_000);
}

export default function AdvertisingPage() {
  const { id, snapshot, ready, reload } = useMember();
  const [tier, setTier] = useState("seconds15");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [quote, setQuote] = useState("");

  async function preview() {
    setError("");
    const response = await fetch(`/api/member-platform/advertising/quote?tier=${tier}&views=500`);
    const body = await response.json();
    if (!response.ok) { setQuote(""); setError(body.error ?? "The package could not be quoted."); return; }
    const usd = dollars(body.purchaseMicrousd);
    setQuote(body.solAvailable
      ? `${usd} for 500 verified views or clicks. Staging conversion is ${formatLamports(body.grossLamports)} SOL. A 100% viewer match is reserved separately only after a verified earning exists. Payment is off. This is not a balance.`
      : `${usd} for 500 verified views or clicks. A live SOL rate is unavailable, so no SOL amount is shown. Payment is off.`);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) { setError("Connect and sign in with your wallet before saving a draft."); return; }
    const form = new FormData(event.currentTarget);
    const result = await saveAdvertisingDraft({
      memberId: id,
      title: String(form.get("title") ?? ""),
      url: String(form.get("url") ?? ""),
      tier,
      views: 500,
    });
    if (!result.ok) { setError(result.error); return; }
    setMessage("Draft saved. No payment was collected.");
    await reload();
  }

  if (!ready || !snapshot) return <p className="text-violet-200">Loading advertising…</p>;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-amber-300">Advertising</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">One-time prepaid packages of 500 verified views or clicks. There is no subscription. Funding is paused, and no per-view dollar reward is configured.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(ADVERTISING_TIERS).map(([key, item]) => (
          <article key={key} className={`rounded-2xl border bg-[#150d24] p-4 ${tier === key ? "border-amber-300" : "border-white/10"}`}>
            <h2 className="font-semibold">{item.label}</h2>
            <p className="mt-2 text-2xl text-amber-200">{dollars(item.priceMicrousd)}</p>
            <p className="text-sm text-violet-200">{item.views} verified views or clicks</p>
            <button type="button" className="mt-4 min-h-11 rounded-xl border border-amber-300/40 px-3 py-2 text-sm text-amber-200" onClick={() => setTier(key)}>Use this package</button>
          </article>
        ))}
      </div>
      <form onSubmit={save} className="grid gap-3 rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Campaign draft</h2>
        <label className="grid gap-1 text-sm">Name<input name="title" required maxLength={80} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
        <label className="grid gap-1 text-sm">HTTPS destination<input name="url" type="url" required placeholder="https://" className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
        <p className="text-sm text-violet-200">Package size is fixed at 500. The selected duration is {ADVERTISING_TIERS[tier as keyof typeof ADVERTISING_TIERS].seconds} seconds.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="min-h-11 rounded-xl border border-white/15 px-4 py-3" onClick={() => void preview()}>Preview accounting</button>
          <button type="submit" className="min-h-11 rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black">Save draft</button>
        </div>
        {quote && <p className="text-sm leading-6 text-violet-100">{quote}</p>}
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
      </form>
      <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Draft analytics</h2>
        {snapshot.campaigns.length === 0 ? <p className="mt-3 text-sm text-violet-200">No drafts saved on this server.</p> : (
          <ul className="mt-3 space-y-3">
            {snapshot.campaigns.map((item) => (
              <li key={item.id} className="text-sm text-violet-100">{item.title} · {item.verified} of {item.views} views server-verified · payment {item.paymentEnabled ? "on" : "off"}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
