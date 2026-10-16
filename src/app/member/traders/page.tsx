"use client";

import { useEffect, useState } from "react";

type Row = { rank: number; handle: string; displayName: string; memberId: string; returnBps: string; unrealizedSol: string; realizedSol: string; fills: number; virtual: true };

export default function TradersPage() {
  const [period, setPeriod] = useState("daily");
  const [start, setStart] = useState("");
  const [book, setBook] = useState("paper");
  const [body, setBody] = useState<{ rows?: Row[]; reason?: string; note?: string; book?: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setBody(null);
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    fetch(`/api/member-platform/traders?period=${period}&book=${book}&start=${start}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) { const body = await response.json(); throw new Error(body.error || "Rankings unavailable"); } return response.json(); })
      .then(data => { if (active) setBody(data); })
      .catch(reason => { if (active) setBody({ reason: reason instanceof Error ? reason.message : "Rankings could not be loaded." }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [period, book, start]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-amber-300">Top 100 traders</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">Daily, weekly, and monthly windows. Paper results stay on the paper board. Verified live results are published only from reconciled Mainnet trades, which are paused.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {["daily", "weekly", "monthly"].map((item) => <button key={item} type="button" className={`rounded-full px-3 py-2 text-sm ${period === item ? "bg-amber-300 text-black" : "bg-white/5"}`} onClick={() => { setPeriod(item); setStart(""); }}>{item}</button>)}
        {["paper", "live"].map((item) => <button key={item} type="button" className={`rounded-full px-3 py-2 text-sm ${book === item ? "bg-violet-400 text-black" : "bg-white/5"}`} onClick={() => setBook(item)}>{item === "paper" ? "Paper" : "Verified live"}</button>)}
      </div>
      {book === "paper" && <label className="grid gap-1 text-sm">Closed period start (UTC; blank for current)<input type="date" value={start} onChange={event => setStart(event.target.value)} className="w-fit rounded-xl border border-white/10 bg-black/30 px-3 py-2" /></label>}
      {body?.book === "verified-live" || book === "live" ? (
        <p className="rounded-2xl border border-white/10 bg-[#150d24] p-4 text-sm text-violet-100">{body?.reason ?? "Mainnet trading is paused. No verified live results are published."}</p>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4">
          <p className="text-sm text-violet-200">{body?.note ?? body?.reason ?? "Loading rankings…"}</p>
          {body?.rows?.length ? (
            <ol className="mt-4 space-y-2">
              {body.rows.map((row) => <li key={row.memberId} className="text-sm text-violet-100">{row.rank}. @{row.handle} · return {(Number(row.returnBps) / 100).toFixed(2)}% · unrealized {row.unrealizedSol} · realized {row.realizedSol} virtual SOL · {row.fills} fills</li>)}
            </ol>
          ) : <p className="mt-3 text-sm text-violet-200">No eligible ranked entries with complete fresh valuations in this window. Rankings are not estimated.</p>}
        </section>
      )}
    </div>
  );
}
