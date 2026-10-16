"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { submitPaperFill } from "@/app/member/actions";
import { useMember } from "@/components/member/useMember";
import { formatLamports } from "@/lib/member-platform/economics";
import { PAPER_DISCLOSURE, PAPER_SYMBOLS, microUnitsToDisplay } from "@/lib/member-platform/paper";

export default function PaperPage() {
  const { id, snapshot, ready, error: loadError, reload } = useMember();
  const currentActor = useRef(id);
  currentActor.current = id;
  const [historyActor, setHistoryActor] = useState<string | null>(id);
  const pending = useRef(false);
  const retry = useRef<{ key: string; id: string } | null>(null);
  const [older, setOlder] = useState<{id:string; symbol:string; side:string; at:string; microUnits:string; virtualLamports:string; priceSource:string}[]>([]);
  const visibleOlder = historyActor === id ? older : [];
  const [historyEnd, setHistoryEnd] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  useEffect(() => { setOlder([]); setHistoryEnd(false); }, [id]);
  const [busy, setBusy] = useState(false);
  const [symbol, setSymbol] = useState("JUP");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.1");
  const [price, setPrice] = useState("Checking the live price…");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setPrice("Checking the live price…");
    fetch(`/api/member-platform/prices?symbol=${symbol}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(body => { if (active) setPrice(body.available ? `${symbol}: $${(Number(body.microusd) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} · ${body.source}. Fills require a fresh server observation.` : `${symbol} price is unavailable. No fill will be recorded.`); })
      .catch(() => { if (active) setPrice("The price service could not be reached. No fill will be recorded."); });
    return () => { active = false; controller.abort(); };
  }, [symbol]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!id) { setError("Connect and sign in with your wallet before paper trading."); return; }
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    const key = JSON.stringify([id, symbol, side, amount]);
    if (retry.current?.key !== key) retry.current = { key, id: crypto.randomUUID() };
    try {
    const result = await submitPaperFill({ memberId: id, symbol, side, amount, requestId: retry.current.id });
    if (!result.ok) { setError(result.error); return; }
    setMessage("Paper fill recorded from a live price. It is virtual and was not broadcast.");
    retry.current = null;
    await reload().catch(() => setError("The fill was recorded, but the portfolio could not refresh. Refresh before placing another order."));
    } catch { setError("The response could not be confirmed. Retry the same order to safely check it."); }
    finally { pending.current = false; setBusy(false); }
  }

  async function olderFills() {
    if (!snapshot?.paper || historyBusy) return;
    const requestedActor = id;
    const fills = [...snapshot.paper.fills, ...visibleOlder];
    const cursor = fills[fills.length - 1];
    if (!cursor) return;
    setHistoryBusy(true);
    try {
      const response = await fetch(`/api/member-platform/paper/history?before=${encodeURIComponent(cursor.at)}&id=${cursor.id}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "History unavailable");
      if (currentActor.current !== requestedActor) return;
      setHistoryActor(requestedActor);
      const seen = new Set(fills.map(fill => fill.id));
      setOlder([...visibleOlder, ...body.fills.filter((fill: {id:string}) => !seen.has(fill.id))]);
      setHistoryEnd(body.fills.length < 100);
    } catch { setError("Older fills could not be loaded. Your history was not changed."); }
    finally { setHistoryBusy(false); }
  }

  if (!ready) return <p className="text-violet-200">Loading paper trading…</p>;
  if (!snapshot) return <p className="text-violet-200">{loadError || "Paper trading could not be loaded."}</p>;
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
      {snapshot.paper && <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4" aria-label="Paper portfolio">
        <h2 className="font-semibold">Portfolio performance</h2>
        {snapshot.paperValuation?.available ? <>
          <p>Net liquidation equity: {formatLamports(snapshot.paperValuation.equityLamports!)} virtual SOL</p>
          <p>Realized: {formatLamports(snapshot.paperValuation.realizedLamports!)} · Unrealized: {formatLamports(snapshot.paperValuation.unrealizedLamports!)} virtual SOL</p>
        </> : <p>{snapshot.paperValuation?.reason || "Fresh portfolio valuation is unavailable. Holdings are not estimated."}</p>}
        {snapshot.paperHistory.length > 1 && <svg viewBox="0 0 600 160" role="img" aria-label="Recorded portfolio equity at trade times, in virtual SOL" className="mt-3 w-full max-h-40">
          <title>Recorded portfolio equity at trade times; gaps without fresh prices are omitted</title>
          <polyline fill="none" stroke="currentColor" strokeWidth="2" points={(() => {
            const points = snapshot.paperHistory.map(point => Number(point.equityLamports) / 1e9);
            const low = Math.min(...points), high = Math.max(...points), range = Math.max(high - low, 0.001);
            return points.map((value,index) => `${10 + index * 580 / (points.length - 1)},${150 - (value - low) * 140 / range}`).join(" ");
          })()} />
        </svg>}
        <p className="mt-2 text-sm text-violet-200">Paper model: 1.75% simulated trading cost, 0.50% adverse execution and 0.000005 virtual SOL network cost per fill. These are simulation assumptions, not real charges or executable market quotes.</p>
      </section>}
      <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
        <label className="grid gap-1 text-sm">Symbol
          <select value={symbol} onChange={(event) => setSymbol(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
            {PAPER_SYMBOLS.map(asset => <option key={asset} value={asset}>{asset}</option>)}
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
        <button type="submit" disabled={busy || snapshot.paperPersistence !== "ready"} className="w-fit rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black">Record paper fill</button>
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
      </form>
      <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4">
        <h2 className="font-semibold">Positions and fills</h2>
        {snapshot.paper?.positions.length ? snapshot.paper.positions.map((position) => (
          <p key={position.symbol} className="mt-2 text-sm text-violet-100">{position.symbol}: {microUnitsToDisplay(BigInt(position.microUnits))} paper units</p>
        )) : <p className="mt-2 text-sm text-violet-200">No paper positions.</p>}
        <ul className="mt-3 space-y-2">
          {[...(snapshot.paper?.fills ?? []), ...visibleOlder].filter((fill,index,rows) => rows.findIndex(row => row.id===fill.id)===index).map(fill => <li key={fill.id} className="text-sm text-violet-100">{new Date(fill.at).toLocaleString()} · Paper {fill.side} {microUnitsToDisplay(BigInt(fill.microUnits))} {fill.symbol} · {formatLamports(fill.virtualLamports)} virtual SOL · source {fill.priceSource}</li>)}
        </ul>
        {!historyEnd && snapshot.paper && (snapshot.paper.fillCount ?? 0) > snapshot.paper.fills.length + visibleOlder.length && <button type="button" disabled={historyBusy} onClick={() => void olderFills()} className="mt-3 rounded-xl border border-white/10 px-3 py-2">Load older fills</button>}
      </section>
    </div>
  );
}
