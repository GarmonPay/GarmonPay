"use client";

import { useEffect, useState } from "react";

type Row = { rank: number; handle: string; displayName: string; realizedSol: string; fills: number; virtual: true };

export default function TradersPage() {
  const [period, setPeriod] = useState("daily");
  const [book, setBook] = useState("paper");
  const [body, setBody] = useState<{ rows?: Row[]; reason?: string; note?: string; book?: string } | null>(null);

  useEffect(() => {
    fetch(`/api/member-platform/traders?period=${period}&book=${book}`).then((response) => response.json()).then(setBody).catch(() => setBody({ reason: "Rankings could not be loaded." }));
  }, [period, book]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-amber-300">Top 100 traders</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">Daily, weekly, and monthly windows. Paper results stay on the paper board. Verified live results are published only from reconciled Mainnet trades, which are paused.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {["daily", "weekly", "monthly"].map((item) => <button key={item} type="button" className={`rounded-full px-3 py-2 text-sm ${period === item ? "bg-amber-300 text-black" : "bg-white/5"}`} onClick={() => setPeriod(item)}>{item}</button>)}
        {["paper", "live"].map((item) => <button key={item} type="button" className={`rounded-full px-3 py-2 text-sm ${book === item ? "bg-violet-400 text-black" : "bg-white/5"}`} onClick={() => setBook(item)}>{item === "paper" ? "Paper" : "Verified live"}</button>)}
      </div>
      {body?.book === "verified-live" || book === "live" ? (
        <p className="rounded-2xl border border-white/10 bg-[#150d24] p-4 text-sm text-violet-100">{body?.reason ?? "Mainnet trading is paused. No verified live results are published."}</p>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-[#150d24] p-4">
          <p className="text-sm text-violet-200">{body?.note}</p>
          {body?.rows?.length ? (
            <ol className="mt-4 space-y-2">
              {body.rows.map((row) => <li key={row.handle} className="text-sm text-violet-100">{row.rank}. @{row.handle} · realized {row.realizedSol} virtual SOL · {row.fills} fills</li>)}
            </ol>
          ) : <p className="mt-3 text-sm text-violet-200">No paper fills in this window. Rankings are not estimated.</p>}
        </section>
      )}
    </div>
  );
}
