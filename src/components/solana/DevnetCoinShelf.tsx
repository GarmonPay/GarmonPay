"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatCoinAge, formatDevnetLaunchTime } from "@/lib/solana/coin-launch-client";
import { CoinMark } from "./CoinMark";
import { formatFeePercent } from "@/lib/solana/launch-fees";

type Fees = { platform: string; creator: string; protocol: string };
type Coin = {
  mint: string;
  name: string | null;
  symbol: string | null;
  imageUrl?: string | null;
  creator?: string | null;
  launchedAt?: string | null;
  status?: string | null;
  tradingOpen?: boolean;
  venue?: string | null;
  progress?: number | null;
  curveValueLamports?: string | null;
  volumeLamports?: string | null;
  creatorFeeLamports?: string | null;
  tradeCount?: number;
  fees?: Fees | null;
  explorerMint: string;
  explorerTransaction: string | null;
};

const views = ["Newest", "Trending", "Near graduation"] as const;

function sol(lamports: string | null | undefined) {
  if (lamports == null) return null;
  const value = Number(lamports) / 1_000_000_000;
  if (!Number.isFinite(value)) return null;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 6 })} Devnet SOL`;
}

function short(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function DevnetCoinShelf({ mine = false }: { mine?: boolean }) {
  const [coins, setCoins] = useState<Coin[] | null>(null);
  const [signedIn, setSignedIn] = useState(!mine);
  const [view, setView] = useState<(typeof views)[number]>("Newest");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let live = true;
    const refresh = () => { void fetch(mine ? "/api/solana/launches/coins?mine=1" : "/api/solana/launches/coins", { cache: "no-store", credentials: "same-origin" }).then(response => response.json()).then(body => {
      if (!live || !Array.isArray(body.coins)) return;
      setCoins(body.coins);
      if (mine) setSignedIn(body.signedIn !== false);
    }).catch(() => { if (live) setCoins([]); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("garmonpay:coin-created", refresh);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { live = false; window.clearInterval(clock); window.removeEventListener("focus", refresh); window.removeEventListener("garmonpay:coin-created", refresh); };
  }, [mine]);
  const ordered = useMemo(() => {
    const rows = [...(coins ?? [])];
    if (view === "Trending") rows.sort((a, b) => (b.tradeCount ?? 0) - (a.tradeCount ?? 0) || String(b.launchedAt ?? "").localeCompare(String(a.launchedAt ?? "")));
    else if (view === "Near graduation") rows.sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0));
    else rows.sort((a, b) => String(b.launchedAt ?? "").localeCompare(String(a.launchedAt ?? "")));
    return rows;
  }, [coins, view]);
  return <section id={mine ? "my-coins" : undefined} className="gp-sol-section-space" aria-label={mine ? "My Coins" : "Devnet coins"}>
    <h2>{mine ? "My Coins" : "Devnet coins"}</h2>
    <div className="gp-workspace-tabs" role="group" aria-label="Coin order">{views.map(option => <button type="button" key={option} aria-pressed={view === option} onClick={() => setView(option)}>{option}</button>)}</div>
    <p className="gp-sol-muted">{view === "Trending" ? "Ordered by confirmed pool transactions. Trading volume is not estimated." : view === "Near graduation" ? "Ordered by bonding-curve progress toward the Devnet raise target." : "Ordered by the Devnet block time."}</p>
    {coins === null ? <p role="status">Checking Devnet coins…</p> : null}
    {mine && coins && !signedIn ? <p>Sign in with your wallet to see the coins you launched.</p> : null}
    {coins && !coins.length && (!mine || signedIn) ? <p>{mine ? "You have not launched a Devnet coin yet." : "No Devnet coins have been confirmed yet."}</p> : null}
    {ordered.length ? <ul className="gp-sol-grid">{ordered.map(coin => {
      const launched = formatDevnetLaunchTime(coin.launchedAt);
      const age = formatCoinAge(coin.launchedAt, now);
      const value = sol(coin.curveValueLamports);
      const rewards = sol(coin.creatorFeeLamports);
      return <li key={coin.mint} className="gp-market-card">
        <CoinMark symbol={coin.symbol || "GP"} imageUrl={coin.imageUrl} />
        <h3><Link href={`/solana/token/${coin.mint}`}>{coin.name || "Devnet coin"}{coin.symbol ? ` (${coin.symbol})` : ""}</Link></h3>
        <p>{coin.venue === "cpmm" ? "Graduated pool open" : coin.tradingOpen ? "Bonding curve open" : coin.status || "Status unavailable"}{coin.progress != null ? ` · ${coin.progress.toFixed(1)}% raised` : ""}</p>
        {launched ? <p>Launched {launched}</p> : null}
        {age ? <p>Age {age}</p> : null}
        {value ? <p>Bonding-curve value {value}</p> : null}
        <p>Curve-vault volume {coin.volumeLamports ? sol(coin.volumeLamports) : "unavailable"}</p>
        {coin.creator ? <p>Creator {short(coin.creator)}</p> : null}
        {mine ? <p>Creator fees accrued {rewards || "0 Devnet SOL"}</p> : null}
        {coin.fees ? <p>Fees {formatFeePercent(coin.fees.platform)} platform · {formatFeePercent(coin.fees.creator)} creator · {formatFeePercent(coin.fees.protocol)} protocol</p> : null}
        <p><Link href={`/solana/token/${coin.mint}`}>Open coin</Link> · <a href={coin.explorerMint} target="_blank" rel="noopener noreferrer">Mint</a>{coin.explorerTransaction ? <> · <a href={coin.explorerTransaction} target="_blank" rel="noopener noreferrer">Transaction</a></> : null}</p>
      </li>;
    })}</ul> : null}
  </section>;
}
