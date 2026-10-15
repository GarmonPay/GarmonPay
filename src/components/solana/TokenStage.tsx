"use client";

import { useCallback, useEffect, useState } from "react";
import { CoinMark } from "./CoinMark";
import { DevnetTrade } from "./DevnetTrade";
import { formatCoinAge, formatDevnetLaunchTime } from "@/lib/solana/coin-launch-client";
import { formatFeePercent } from "@/lib/solana/launch-fees";
import type { CpmmBuyWindow } from "@/lib/solana/devnet-cpmm";
import { rawToDecimal, suggestedBuySol } from "@/lib/solana/trade-form";
import { graduationFacts } from "@/lib/solana/trade-venue";

type Trade = { signature: string; blockTime: string | null; failed: boolean; side?: string; venue?: string; solLamports?: string | null; tokenRaw?: string | null };
type Market = {
  pool: string;
  cpmmPool: string | null;
  venue: "curve" | "cpmm" | "paused" | "unavailable";
  status: string;
  poolStatus?: number;
  tradingOpen: boolean;
  progress: number;
  raisedLamports: string;
  targetLamports: string;
  remainingTokenRaw?: string;
  creator: string;
  fees: { platform: string; creator: string; protocol: string } | null;
  cpmmFees?: { trade: string; creator: string; protocolShare: string; fundShare: string } | null;
  priceSource?: "cpmm-reserves" | "bonding-curve";
  liquidityPlace?: "cpmm" | "curve";
  chartKind?: "cpmm-trades" | "curve-quote";
  curveValueLamports: string | null;
  lamportsPerToken: string | null;
  priceSol: string | null;
  liquidityLamports: string | null;
  volumeLamports: string | null;
  volumeLabel: string;
  holders: { count: number; exact: boolean } | null;
  holdersNote?: string | null;
  graduationSpendLamports?: string | null;
  cpmmBuy?: CpmmBuyWindow | null;
  creatorFeeLamports: string;
  cpmmCreatorFeeLamports?: string | null;
  points: { progress: number; price: number }[];
  trades: Trade[];
};

function sol(lamports: string | null | undefined) {
  if (lamports == null) return "Unavailable";
  try {
    const value = BigInt(lamports);
    const whole = value / BigInt(1_000_000_000);
    const fraction = (value % BigInt(1_000_000_000)).toString().padStart(9, "0").replace(/0+$/, "");
    return `${fraction ? `${whole}.${fraction}` : whole.toString()} SOL`;
  } catch {
    return "Unavailable";
  }
}

function short(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function migrationNote(shown: Market) {
  if (shown.cpmmPool) return `Graduated pool ${short(shown.cpmmPool)}.`;
  if (shown.status === "Migrating") return "The bonding curve is complete and trading is paused. Raydium’s migrate wallet has not created the CPMM pool yet.";
  if (shown.status === "Bonding curve") {
    let left = BigInt(0);
    try { left = BigInt(shown.targetLamports) - BigInt(shown.raisedLamports); } catch { left = BigInt(0); }
    const tokens = shown.remainingTokenRaw && /^[0-9]+$/.test(shown.remainingTokenRaw) ? rawToDecimal(shown.remainingTokenRaw, 6) : null;
    return `Migration has not started. ${sol(left.toString())}${tokens ? ` and ${tokens} tokens` : ""} remain unsold. Fees are taken out of a buy, so spending only the SOL still shown does not finish the curve.`;
  }
  return "No Raydium CPMM pool account exists yet.";
}

function activityLabel(trade: Trade) {
  if (trade.failed) return "Failed";
  if (trade.side === "buy") return "Buy";
  if (trade.side === "sell") return "Sell";
  if (trade.side === "migration") return "Liquidity Migration";
  return "Activity";
}

function chartPath(points: { progress: number; price: number }[]) {
  const prices = points.map(point => point.price);
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const span = max - min || 1;
  return points.map((point, index) => {
    const x = point.progress * 560 + 16;
    const y = 168 - ((point.price - min) / span) * 136;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

const INTERVALS = [
  { id: "1m", label: "1m", ms: 60_000 },
  { id: "5m", label: "5m", ms: 300_000 },
  { id: "15m", label: "15m", ms: 900_000 },
  { id: "1h", label: "1h", ms: 3_600_000 },
  { id: "all", label: "All", ms: 0 },
] as const;

export function TokenStage({
  mint, name, symbol, imageUrl, creator, creatorName, launchedAt, signature, market,
}: {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  creator: string | null;
  creatorName: string | null;
  launchedAt: string | null;
  signature: string | null;
  market: Market | null;
}) {
  const [live, setLive] = useState(market);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<"price" | "value" | "trades">("price");
  const [interval, setIntervalId] = useState<(typeof INTERVALS)[number]["id"]>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState("");
  const load = useCallback(() => {
    setRefreshing(true);
    setRefreshNote("");
    void fetch(`/api/solana/devnet/market?mint=${encodeURIComponent(mint)}`, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(body => {
      if (!body?.pool) { setRefreshNote("Devnet did not return a pool. The last read is still shown."); return; }
      setLive(previous => {
        if (!previous) return body;
        const prior = new Map((previous.trades ?? []).map(trade => [trade.signature, trade]));
        const trades = (body.trades ?? []).map((trade: Trade) => {
          const earlier = prior.get(trade.signature);
          if (earlier && trade.side === "other" && earlier.side && earlier.side !== "other") return earlier;
          return trade;
        });
        return { ...body, trades, volumeLamports: body.volumeLamports ?? previous.volumeLamports ?? null };
      });
    }).catch(() => setRefreshNote("Devnet did not refresh. The last read is still shown.")).finally(() => setRefreshing(false));
  }, [mint]);
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    const refresh = window.setInterval(load, 20_000);
    window.addEventListener("garmonpay-market-refresh", load);
    load();
    return () => { window.clearInterval(clock); window.clearInterval(refresh); window.removeEventListener("garmonpay-market-refresh", load); };
  }, [load]);
  const shown = live ?? market;
  const room = shown && BigInt(shown.targetLamports) > BigInt(shown.raisedLamports) ? (BigInt(shown.targetLamports) - BigInt(shown.raisedLamports)).toString() : "0";
  const priced = (shown?.trades ?? []).filter(trade => !trade.failed && trade.solLamports && trade.side !== "other" && trade.blockTime);
  const windowMs = INTERVALS.find(item => item.id === interval)?.ms ?? 0;
  const visibleTrades = windowMs === 0 ? priced : priced.filter(trade => trade.blockTime && now - Date.parse(trade.blockTime) <= windowMs);
  const age = formatCoinAge(launchedAt, now);
  const launched = formatDevnetLaunchTime(launchedAt);
  const line = shown && shown.points.length > 1 ? chartPath(shown.points) : "";
  const holderText = shown?.holders == null ? (shown?.holdersNote || "Unavailable") : shown.holders.exact ? `${shown.holders.count} token accounts` : `${shown.holders.count} or more token accounts`;
  const graduation = shown ? graduationFacts(typeof shown.poolStatus === "number" ? shown.poolStatus : shown.status === "Graduated" ? 2 : shown.status === "Migrating" ? 1 : 0, shown.cpmmPool) : null;
  const graduated = shown?.chartKind === "cpmm-trades" || shown?.venue === "cpmm" || shown?.status === "Graduated";
  const cpmmTrades = (shown?.trades ?? []).filter(trade => !trade.failed && trade.venue === "cpmm" && (trade.side === "buy" || trade.side === "sell") && trade.solLamports && trade.tokenRaw);
  return <div className="gp-token-layout">
    <section className="gp-token-main gp-market-card">
      <div className="gp-token-heading">
        <CoinMark symbol={symbol} imageUrl={imageUrl} />
        <div>
          <h2>{name}{symbol ? ` (${symbol})` : ""}</h2>
          <p>{imageUrl ? "Uploaded artwork" : "No artwork was stored for this coin."}</p>
        </div>
      </div>
      <p className="gp-token-mint">Mint <code>{mint}</code></p>
      {launched ? <p>Launched {launched}{age ? ` · Age ${age}` : ""}</p> : <p>Launch time is unavailable until the Devnet transaction can be read.</p>}
      {shown ? <>
        <div className="gp-chart-switch" role="group" aria-label="Chart view">
          <button type="button" aria-pressed={view === "price"} onClick={() => setView("price")}>Price</button>
          <button type="button" aria-pressed={view === "value"} onClick={() => setView("value")}>Market value</button>
          <button type="button" aria-pressed={view === "trades"} onClick={() => setView("trades")}>Trades</button>
        </div>
        {view === "trades" ? <div className="gp-chart-switch" role="group" aria-label="Trade interval">
          {INTERVALS.map(item => <button type="button" key={item.id} aria-pressed={interval === item.id} onClick={() => setIntervalId(item.id)}>{item.label}</button>)}
        </div> : null}
        {view === "trades" ? <div className="gp-chart-empty" role="status">
          {graduated ? <p>{cpmmTrades.length >= 2 ? `${cpmmTrades.length} confirmed CPMM trades include both a token amount and a SOL amount. A candlestick history is still withheld because these prints are not grouped into open, high, low, and close intervals.` : `No confirmed CPMM trades yet, so no candlesticks are drawn. ${cpmmTrades.length} priced CPMM ${cpmmTrades.length === 1 ? "trade is" : "trades are"} available. Bonding-curve history and the liquidity migration are not used as candles.`}</p> : visibleTrades.length >= 4 ? <p>{visibleTrades.length} decoded trades are in this interval. A candlestick is drawn only when each trade has both a token amount and a SOL amount. These vault changes do not include the token amount, so no candles are drawn.</p> : <p>Not enough decoded trades for candlesticks in this interval. {visibleTrades.length} priced vault {visibleTrades.length === 1 ? "change is" : "changes are"} available. The curve quote is on the Price view.</p>}
        </div> : graduated ? (line ? <svg className="gp-token-chart" viewBox="0 0 592 200" role="img" aria-label="Confirmed CPMM execution prices">
          <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" />
        </svg> : <p className="gp-chart-empty">No confirmed CPMM trades yet, so no price history is drawn. The price below is the current pool reserve quote.</p>) : line ? <svg className="gp-token-chart" viewBox="0 0 592 200" role="img" aria-label={view === "value" ? "Bonding-curve market value from the reserve quote" : "Bonding-curve price quote"}>
          <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" />
        </svg> : <p className="gp-chart-empty">The bonding-curve quote could not be drawn from the on-chain reserves.</p>}
        {view === "trades" ? null : <p className="gp-trade-meta">{graduated ? (view === "value" ? "Market value applies the current CPMM reserve price to the full supply. It is not cash in the pool and not an exchange market cap." : line ? "Each point is a confirmed CPMM trade. It is not a forecast and not the old bonding-curve quote." : "The displayed price is the current CPMM reserve quote. It is not a history of executed trades.") : view === "value" ? "Market value applies the current bonding-curve price to the full supply. It is not cash in the pool and not an exchange market cap." : "The line is the constant-product quote from the initial reserves. It is not a history of executed trades."}</p>}
        {graduation ? <section className="gp-graduation" aria-label="Graduation status">
          <div className="gp-graduation-head">
            <h3>Graduation status</h3>
            <button type="button" onClick={load} disabled={refreshing}>{refreshing ? "Refreshing" : "Refresh"}</button>
          </div>
          <dl>
            <div><dt>LaunchLab status</dt><dd>{graduation.code} · {graduation.label}</dd></div>
            <div><dt>Progress</dt><dd>{shown.progress.toFixed(2)}% · {sol(shown.raisedLamports)} of {sol(shown.targetLamports)}</dd></div>
            <div><dt>CPMM pool</dt><dd>{shown.cpmmPool ? <a href={`https://explorer.solana.com/address/${shown.cpmmPool}?cluster=devnet`} target="_blank" rel="noopener noreferrer">{shown.cpmmPool}</a> : "No pool account yet"}</dd></div>
            <div><dt>Migration</dt><dd>{graduation.migration}</dd></div>
          </dl>
          {refreshNote ? <p role="status">{refreshNote}</p> : null}
        </section> : null}
        <dl className="gp-token-stats">
          <div><dt>Market value</dt><dd>{sol(shown.curveValueLamports)}</dd></div>
          <div><dt>Price</dt><dd>{shown.priceSol ? `${shown.priceSol} SOL per token` : "Unavailable"}</dd></div>
          <div><dt>Liquidity</dt><dd>{sol(shown.liquidityLamports)}{shown.liquidityPlace === "cpmm" || shown.priceSource === "cpmm-reserves" ? " in the CPMM pool" : " on the curve"}</dd></div>
          <div><dt>Volume</dt><dd>{shown.volumeLamports ? sol(shown.volumeLamports) : "Unavailable"}</dd></div>
          <div><dt>Holders</dt><dd>{holderText}</dd></div>
          <div><dt>{shown.status === "Bonding curve" ? "Curve" : "Status"}</dt><dd>{shown.status}{shown.status === "Bonding curve" ? ` · ${shown.progress.toFixed(1)}%` : ""}</dd></div>
        </dl>
        <div className="gp-trade-curve" aria-label={graduated ? "Curve amount raised before migration" : "Bonding-curve progress"}>
          <span>{graduated ? `${sol(shown.raisedLamports)} raised of ${sol(shown.targetLamports)} before migration` : `${sol(shown.raisedLamports)} raised of ${sol(shown.targetLamports)}`}</span>
          <span className="gp-trade-meter"><i style={{ width: `${Math.max(0, Math.min(100, shown.progress))}%` }} /></span>
        </div>
        <p className="gp-trade-meta">{shown.volumeLamports ? shown.volumeLabel : graduated ? "Volume stays blank until every recent buy and sell can be read. Liquidity migration is not counted as volume." : "Volume stays blank until every recent curve-vault change can be read."} {migrationNote(shown)}</p>
        {shown.cpmmFees ? <p>CPMM fees {formatFeePercent(shown.cpmmFees.trade)} trade and {formatFeePercent(shown.cpmmFees.creator)} creator. Protocol takes {formatFeePercent(shown.cpmmFees.protocolShare)} of the trade fee and the fund fee takes {formatFeePercent(shown.cpmmFees.fundShare)} of the trade fee. These are Raydium CPMM rates, separate from the bonding-curve platform fee. CPMM creator fees accrued {sol(shown.cpmmCreatorFeeLamports)}. Bonding-curve creator fees accrued {sol(shown.creatorFeeLamports)}.</p> : shown.fees ? <p>Bonding-curve fees {formatFeePercent(shown.fees.platform)} platform, {formatFeePercent(shown.fees.creator)} creator, {formatFeePercent(shown.fees.protocol)} protocol. Creator fees accrued {sol(shown.creatorFeeLamports)}.</p> : null}
        <h3>Recent transactions</h3>
        {shown.trades.length ? <ul className="gp-token-trades">{shown.trades.map(trade => <li key={trade.signature}>
          <span>{activityLabel(trade)}</span>
          <span>{trade.solLamports ? sol(trade.solLamports) : "Amount unread"}</span>
          <span>{trade.blockTime ? formatDevnetLaunchTime(trade.blockTime) : "Time unread"}</span>
          <a href={`https://explorer.solana.com/tx/${trade.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer">{trade.signature.slice(0, 8)}</a>
        </li>)}</ul> : <p>No pool transactions have been recorded.</p>}
      </> : <p role="status">The bonding curve could not be read. No price, volume, or order is shown.</p>}
      <h3>Creator</h3>
      {creatorName ? <p>{creatorName}</p> : null}
      {creator ? <p>Wallet <a href={`https://explorer.solana.com/address/${creator}?cluster=devnet`} target="_blank" rel="noopener noreferrer">{short(creator)}</a></p> : <p>Creator wallet is unavailable.</p>}
      <p><a href={`https://explorer.solana.com/address/${mint}?cluster=devnet`} target="_blank" rel="noopener noreferrer">View the mint</a>{signature ? <> · <a href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer">View the launch</a></> : null}</p>
    </section>
    <aside className="gp-token-side">
      {shown ? <DevnetTrade mint={mint} symbol={symbol || "TOKEN"} tradingOpen={shown.tradingOpen} status={shown.status} venue={shown.venue === "cpmm" ? "cpmm" : "curve"} suggestedBuy={suggestedBuySol(room)} graduationSpend={shown.graduationSpendLamports} remainingLamports={room} progress={shown.progress} raisedLamports={shown.raisedLamports} targetLamports={shown.targetLamports} cpmmBuy={shown.cpmmBuy} /> : <section className="gp-trade-panel"><h3>Devnet trade</h3><p>The pool could not be read, so no buy or sell is offered.</p></section>}
    </aside>
  </div>;
}
