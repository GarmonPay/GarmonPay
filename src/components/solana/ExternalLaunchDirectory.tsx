"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { RaydiumDirectoryToken } from "@/lib/solana/raydium-directory";

type Directory = { tokens: RaydiumDirectoryToken[]; fees: { note: string } };
const sorts = [
  { id: "new", label: "New" },
  { id: "hotToken", label: "Active" },
  { id: "lastTrade", label: "Recent" },
] as const;

function compact(value: string | null) {
  if (!value) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(amount);
}

function curveProgress(value: string | null) {
  if (!value) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const percent = amount <= 1 ? amount * 100 : amount;
  return Math.max(0, Math.min(100, percent));
}

function TokenCard({ token }: { token: RaydiumDirectoryToken }) {
  const progress = curveProgress(token.finishingRate);
  return <Link className="gp-market-card" href={`/solana/token/${token.mint}`}>
    <div className="gp-token-card-top">
      {token.imageUrl ? <img className="gp-token-art" src={token.imageUrl} alt="" width={48} height={48} /> : <span className="gp-token-art" aria-hidden="true" />}
      <div><p className="gp-market-symbol">{token.symbol}</p><h3>{token.name}</h3></div>
    </div>
    <div className="gp-curve" aria-hidden="true"><i style={{ width: `${progress ?? 0}%` }} /></div>
    <p className="gp-fee-note">{progress == null ? "Curve progress unavailable" : `${progress.toFixed(0)}% of the curve`}</p>
    <div className="gp-market-stats">
      <p><span>Market cap</span>{compact(token.reportedMarketCap)}</p>
      <p><span>Volume</span>{compact(token.reportedVolume)}</p>
    </div>
  </Link>;
}

export function ExternalLaunchDirectory() {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<(typeof sorts)[number]["id"]>("new");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setSearching(false);
    fetch(`/api/solana/discovery/raydium?sort=${sort}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("unavailable");
        return response.json() as Promise<Directory>;
      })
      .then(payload => {
        if (!Array.isArray(payload.tokens)) throw new Error("unavailable");
        setDirectory(payload);
        setState("ready");
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, [attempt, sort]);
  async function search(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (text.length < 2) return;
    setSearching(true);
    setState("loading");
    try {
      const response = await fetch(`/api/solana/discovery/raydium/search?text=${encodeURIComponent(text)}`);
      const payload = await response.json() as Directory;
      if (!response.ok || !Array.isArray(payload.tokens)) throw new Error("unavailable");
      setDirectory(payload);
      setState("ready");
    } catch {
      setState("error");
    } finally {
      setSearching(false);
    }
  }
  return <section className="gp-launch-board" aria-labelledby="external-launch-directory">
    <div className="gp-directory-head">
      <div>
        <p className="gp-sol-eyebrow">SOLANA</p>
        <h2 id="external-launch-directory">Tokens</h2>
      </div>
      <p className="gp-fee-note">Listed on Raydium. Trading on GarmonPay is not open.</p>
    </div>
    <div className="gp-sol-inline-actions" role="group" aria-label="Raydium sort">
      {sorts.map(item => <button key={item.id} type="button" className="gp-button" aria-pressed={sort === item.id} onClick={() => { setQuery(""); setSort(item.id); }}>{item.label}</button>)}
    </div>
    <form className="gp-sol-inline-actions" onSubmit={search}>
      <label>Search<input value={query} maxLength={32} onChange={event => setQuery(event.target.value)} placeholder="Name or symbol" /></label>
      <button className="gp-button" type="submit" disabled={searching || query.trim().length < 2}>{searching ? "Searching…" : "Search"}</button>
    </form>
    {state === "loading" ? <p role="status">Loading tokens…</p> : state === "error" ? <div role="status"><h3>Tokens are unavailable</h3><button className="gp-button" type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : directory && directory.tokens.length > 0 ? <div className="gp-sol-token-grid">
      {directory.tokens.map(token => <TokenCard key={token.mint} token={token} />)}
    </div> : <p role="status">No tokens to show.</p>}
  </section>;
}
