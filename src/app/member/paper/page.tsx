"use client";

import { FormEvent, useEffect, useState } from "react";
import { submitPaperFill } from "@/app/member/actions";
import { useMember } from "@/components/member/useMember";
import { PAPER_DISCLOSURE, microUnitsToDisplay } from "@/lib/member-platform/paper";

export default function PaperPage() {
  const { id, snapshot, ready, reload } = useMember();
  const [symbol, setSymbol] = useState("BTC");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.1");
  const [price, setPrice] = useState("Checking the live price…");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/member-platform/prices?symbol=${symbol}`).then((response) => response.json()).then((body) => {
      setPrice(body.available ? `${symbol} price source: ${body.source}. The fill uses a fresh server quote.` : `${symbol} price is unavailable. No fill will be recorded.`);
    }).catch(() => setPrice("The price service could not be reached. No fill will be recorded."));
  }, [symbol]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!id) { setError("Create a staging profile before paper trading."); return; }
    setError("");
    const result = await submitPaperFill({ memberId: id, symbol, side, amount });
    if (!result.ok) { setError(result.error); return; }
    setMessage("Paper fill recorded from a live price. It is virtual and was not broadcast.");
    await reload();
  }

  if (!ready || !snapshot) return <p className="text-violet-200">Loading paper trading…</p>;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-amber-300">Paper trading</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">{PAPER_DISCLOSURE} Mainnet trading remains paused.</p>
      </header>
      <section className="rounded-2xl border border-amber-300/30 bg-[#150d24] p-4">
        <h2 className="text-sm uppercase tracking-wide text-amber-200">Virtual cash</h2>
        <p className="mt-2 text-2xl">{snapshot.paper ? `${snapshot.paper.cashSol} virtual SOL` : "No virtual SOL issued yet"}</p>
      </section>
      <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
        <label className="grid gap-1 text-sm">Symbol
          <select value={symbol} onChange={(event) => setSymbol(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
            <option value="BTC">BTC</option>
            <option value="ETH">ETH</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">Side
          <select aria-label="Paper side" value={side} onChange={(event) => setSide(event.target.value as "buy" | "sell")} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
            <option value="buy">Paper buy</option>
            <option value="sell">Paper sell</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">{side === "buy" ? "Virtual SOL to use" : "Token amount"}<input value={amount} onChange={(event) => setAmount(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
        <p className="text-sm text-violet-200">{price}</p>
        <button type="submit" className="w-fit rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black">Record paper fill</button>
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
      </form>
      <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4">
        <h2 className="font-semibold">Positions and fills</h2>
        {snapshot.paper?.positions.length ? snapshot.paper.positions.map((position) => (
          <p key={position.symbol} className="mt-2 text-sm text-violet-100">{position.symbol}: {microUnitsToDisplay(BigInt(position.microUnits))} paper units</p>
        )) : <p className="mt-2 text-sm text-violet-200">No paper positions.</p>}
        <ul className="mt-3 space-y-2">
          {snapshot.paper?.fills.map((fill) => <li key={fill.at + fill.symbol} className="text-sm text-violet-100">Paper {fill.side} {fill.symbol} · source {fill.priceSource}</li>)}
        </ul>
      </section>
    </div>
  );
}
