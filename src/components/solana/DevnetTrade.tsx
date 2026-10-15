"use client";

import { useEffect, useState } from "react";
import { Buffer } from "buffer";
import { Transaction } from "@solana/web3.js";
import { coinJson, coinOperation } from "@/lib/solana/coin-launch-client";
import { formatFeePercent } from "@/lib/solana/launch-fees";
import { classifySessionResponse } from "@/lib/solana/session-client";
import { SELL_TEST_AMOUNTS, buyAmountChoices, cpmmBuyChoices, parseSlippagePercent, priceImpactDecision, rawToDecimal, slippageWarning, toRawUnits } from "@/lib/solana/trade-form";
import type { CpmmBuyWindow } from "@/lib/solana/devnet-cpmm";

type Side = "buy" | "sell";
type Phase = "idle" | "reviewing" | "ready" | "signing" | "submitting" | "confirmed";
type WalletProvider = { publicKey?: { toString(): string }; connect: () => Promise<{ publicKey: { toString(): string } }>; signTransaction: (transaction: Transaction) => Promise<Transaction> };
type Quote = {
  side: Side;
  expectedOut: string;
  minimumOut: string;
  amountIn: string;
  requestedAmount: string;
  graduates: boolean;
  priceImpact: string | null;
  fees: { platform: string; creator: string; protocol: string };
  split: { platform: string; creator: string; protocol: string };
  venue?: "bonding-curve" | "cpmm";
  feeNote?: string;
  networkFeeLamports: number;
  solLamports: string | null;
  tokenRaw: string;
  raisedLamports: string;
  targetLamports: string;
  progress: number;
  unsignedTransaction: string;
  lastValidBlockHeight: number;
  simulationPassed: boolean;
  signature?: string;
};
type Context = {
  signedIn?: boolean;
  solLamports?: string | null;
  tokenRaw?: string;
  tokenDecimals?: number;
  remainingLamports?: string;
  suggestedBuySol?: string;
};

function provider() {
  const wallets = window as unknown as { solana?: WalletProvider; solflare?: WalletProvider; backpack?: WalletProvider };
  return [wallets.solana, wallets.solflare, wallets.backpack].find(wallet => typeof wallet?.signTransaction === "function") ?? null;
}

function tickerOf(symbol: string) {
  return /^[A-Z0-9]{1,12}$/.test(symbol) ? symbol : "TOKEN";
}

function sol(lamports: string | null | undefined) {
  if (lamports == null) return "unavailable";
  try {
    const value = BigInt(lamports);
    const whole = value / BigInt(1_000_000_000);
    const fraction = (value % BigInt(1_000_000_000)).toString().padStart(9, "0").replace(/0+$/, "");
    return `${fraction ? `${whole}.${fraction}` : whole.toString()} SOL`;
  } catch {
    return "unavailable";
  }
}

export function DevnetTrade({
  mint, symbol, tradingOpen, status, venue = "curve", suggestedBuy, graduationSpend, remainingLamports, progress, raisedLamports, targetLamports, cpmmBuy = null,
}: {
  mint: string;
  symbol: string;
  tradingOpen: boolean;
  status: string;
  venue?: "curve" | "cpmm";
  suggestedBuy: string;
  graduationSpend?: string | null;
  remainingLamports: string;
  progress: number;
  raisedLamports: string;
  targetLamports: string;
  cpmmBuy?: CpmmBuyWindow | null;
}) {
  const ticker = tickerOf(symbol);
  const presetSol = cpmmBuy?.presetLamports ? rawToDecimal(cpmmBuy.presetLamports, 9) : "";
  const openingBuy = venue === "cpmm" ? presetSol : suggestedBuy;
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState(openingBuy);
  const [slippageMode, setSlippageMode] = useState<"0.5" | "1" | "2" | "custom">("1");
  const [customSlippage, setCustomSlippage] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [signature, setSignature] = useState("");
  const slippage = slippageMode === "custom" ? parseSlippagePercent(customSlippage) : { bps: Math.round(Number(slippageMode) * 100) };
  const room = context?.remainingLamports ?? remainingLamports;
  const choices = venue === "cpmm" ? cpmmBuyChoices(cpmmBuy?.maximumLamports ?? null, cpmmBuy?.tradable === true) : buyAmountChoices(room || "0", true);
  useEffect(() => {
    if (!tradingOpen) return;
    let live = true;
    const load = () => {
      void fetch(`/api/solana/devnet/trade?mint=${encodeURIComponent(mint)}`, { cache: "no-store", credentials: "same-origin" }).then(response => response.json()).then(body => {
        if (live) setContext(body);
      }).catch(() => { if (live) setContext({ signedIn: false }); });
    };
    load();
    window.addEventListener("garmonpay-session-change", load);
    window.addEventListener("focus", load);
    return () => { live = false; window.removeEventListener("garmonpay-session-change", load); window.removeEventListener("focus", load); };
  }, [mint, tradingOpen]);
  if (!tradingOpen) {
    const closed = status === "Migrated"
      ? `${ticker} has graduated. The Raydium CPMM pool is not on Devnet yet, so no buy or sell is offered. Orders are not sent to the migrated bonding curve.`
      : status === "Migrating"
        ? `${ticker} is migrating. Bonding-curve orders are paused. The CPMM pool is not open yet, so no order was created.`
        : "Bonding-curve trading is not available for this coin. No order was created.";
    return <section className="gp-trade-panel" aria-label="Devnet trade"><h3>Devnet trade</h3><p>{closed}</p></section>;
  }
  function clearQuote() {
    setQuote(null);
    setSignature("");
    if (phase !== "reviewing" && phase !== "signing" && phase !== "submitting") setPhase("idle");
  }
  function chooseSide(next: Side) {
    setSide(next);
    setAmount(next === "buy" ? (venue === "cpmm" ? presetSol : (context?.suggestedBuySol || suggestedBuy)) : "");
    setError("");
    clearQuote();
  }
  function amountRaw() {
    return toRawUnits(amount, side === "buy" ? 9 : 6);
  }
  let amountError = "";
  try { if (amount.trim()) amountRaw(); else amountError = "Enter an amount."; }
  catch (cause) { amountError = cause instanceof Error ? cause.message : "Enter an amount."; }
  const slippageError = slippageMode === "custom" && customSlippage.trim() !== "" && "error" in slippage ? slippage.error : "";
  const slippageReady = "bps" in slippage;
  const warning = "bps" in slippage ? slippageWarning(slippage.bps) : "";
  const buyRaw = side === "buy" && !amountError && amount.trim() ? amountRaw() : "";
  const overImpact = Boolean(venue === "cpmm" && cpmmBuy?.tradable && cpmmBuy.maximumLamports && buyRaw && BigInt(buyRaw) > BigInt(cpmmBuy.maximumLamports));
  const underMin = Boolean(venue === "cpmm" && cpmmBuy?.tradable && cpmmBuy.minimumLamports && buyRaw && BigInt(buyRaw) < BigInt(cpmmBuy.minimumLamports));
  const buyClosed = venue === "cpmm" && cpmmBuy?.tradable === false && side === "buy";
  const overCurve = side === "buy" && !amountError && room ? BigInt(amountRaw()) > BigInt(room) : false;
  const signedIn = context?.signedIn === true;
  function buttonLabel() {
    if (phase === "signing") return "Confirm in Wallet";
    if (phase === "submitting") return "Submitting";
    if (phase === "confirmed") return "Confirmed";
    if (context === null) return "Review Buy";
    if (!signedIn) return "Connect Wallet";
    if (amountError || !amount.trim()) return "Enter Amount";
    if (!slippageReady) return side === "buy" ? "Review Buy" : "Review Sell";
    if (phase === "ready" && quote) return side === "buy" ? `Buy ${ticker}` : `Sell ${ticker}`;
    return side === "buy" ? "Review Buy" : "Review Sell";
  }
  const label = buttonLabel();
  const busy = phase === "reviewing" || phase === "signing" || phase === "submitting";
  const disabled = busy || phase === "confirmed" || context === null || buyClosed || overImpact || underMin || (signedIn && (!!amountError || !slippageReady));
  async function review() {
    if (!("bps" in slippage)) { setError(slippage.error); return; }
    const wallet = provider();
    if (!wallet) { setError("Open this page in Phantom, Solflare, or Backpack to sign. Nothing was submitted."); return; }
    setPhase("reviewing");
    setError("");
    setQuote(null);
    try {
      const connected = await coinOperation(() => wallet.connect(), "connection");
      const payer = connected.publicKey.toString();
      const sessionResponse = await fetch("/api/solana/auth/session", { cache: "no-store", credentials: "same-origin" });
      const sessionRead = classifySessionResponse(sessionResponse.status, await sessionResponse.json().catch(() => null));
      if (sessionRead.state !== "active" || sessionRead.wallet !== payer) {
        setContext(current => current ? { ...current, signedIn: false } : { signedIn: false });
        setPhase("idle");
        setError("Sign in as the connected wallet before trading. Nothing was submitted.");
        window.dispatchEvent(new Event("garmonpay:open-wallet"));
        return;
      }
      const prepared = await coinJson("/api/solana/devnet/trade", {
        action: "prepare", payer, mint, side, amount: amountRaw(), slippage: slippage.bps,
      }, "preparation") as Quote;
      if (prepared.simulationPassed !== true || !prepared.unsignedTransaction) throw new Error("Devnet did not accept this trade in simulation. Nothing was signed.");
      const impact = priceImpactDecision(prepared.priceImpact);
      if (impact.blocked) throw new Error(impact.level === "unknown" ? "Price impact could not be calculated. No order was created." : `Price impact is ${prepared.priceImpact}. That is above the 5.00% Devnet limit, so no order was created.`);
      setQuote({ ...prepared, side });
      setPhase("ready");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The trade was not prepared.";
      if (/Sign in as the connected wallet/.test(message)) {
        setContext(current => current ? { ...current, signedIn: false } : { signedIn: false });
        setError("Sign in as the connected wallet before trading. Nothing was submitted.");
        window.dispatchEvent(new Event("garmonpay:open-wallet"));
      } else setError(message);
      setPhase("idle");
    }
  }
  async function sign() {
    if (!quote || !("bps" in slippage) || priceImpactDecision(quote.priceImpact).blocked) return;
    const wallet = provider();
    if (!wallet) { setError("Connect your wallet again. Nothing was submitted."); setPhase("idle"); return; }
    setPhase("signing");
    setError("");
    try {
      const connected = await coinOperation(() => wallet.connect(), "connection");
      const payer = connected.publicKey.toString();
      const transaction = Transaction.from(Uint8Array.from(atob(quote.unsignedTransaction), char => char.charCodeAt(0)));
      const reviewed = Buffer.from(transaction.serializeMessage()).toString("base64");
      const signed = await coinOperation(() => wallet.signTransaction(transaction), "signature");
      if (Buffer.from(signed.serializeMessage()).toString("base64") !== reviewed) throw new Error("The wallet changed the reviewed trade. Nothing was submitted.");
      setPhase("submitting");
      const bytes = signed.serialize();
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const result = await coinJson("/api/solana/devnet/trade", {
        action: "submit", payer, mint, side: quote.side, amount: quote.amountIn, slippage: slippage.bps,
        transaction: btoa(binary), lastValidBlockHeight: quote.lastValidBlockHeight,
      }, "submission") as { confirmed?: boolean; signature?: string; confirmationStatus?: string };
      if (result.confirmed !== true || result.confirmationStatus !== "finalized" || typeof result.signature !== "string") throw new Error("Devnet did not finalize the trade. Check the explorer before trying again.");
      setSignature(result.signature);
      setPhase("confirmed");
      window.dispatchEvent(new Event("garmonpay-market-refresh"));
    } catch (cause) {
      setPhase(quote ? "ready" : "idle");
      setError(cause instanceof Error ? cause.message : "The trade was not submitted.");
    }
  }
  function activate() {
    if (phase === "confirmed" || busy) return;
    if (!signedIn) { window.dispatchEvent(new Event("garmonpay:open-wallet")); return; }
    if (quote && phase === "ready") void sign();
    else void review();
  }
  const curveProgress = quote?.progress ?? progress;
  const balance = quote?.solLamports ?? context?.solLamports;
  const tokenBalance = quote?.tokenRaw ?? context?.tokenRaw ?? "0";
  const statusText = phase === "confirmed" ? "Solana Devnet · Finalized" : phase === "submitting" ? "Solana Devnet · Submitted, waiting for finality" : phase === "signing" ? "Solana Devnet · Waiting for wallet approval" : quote ? "Solana Devnet · Simulated · Not submitted" : "Solana Devnet · Not submitted";
  return <form className="gp-trade-panel" aria-label="Devnet trade" onSubmit={event => { event.preventDefault(); activate(); }}>
    <div className="gp-trade-sides" role="group" aria-label="Trade side">
      <button type="button" aria-pressed={side === "buy"} onClick={() => chooseSide("buy")}>Buy</button>
      <button type="button" aria-pressed={side === "sell"} onClick={() => chooseSide("sell")}>Sell</button>
    </div>
    {balance == null ? <p className="gp-trade-meta">Sign in to see your Devnet SOL and token balance.</p> : <dl className="gp-trade-balances">
      <div><dt>Devnet SOL</dt><dd>{sol(balance)}</dd></div>
      <div><dt>{ticker} balance</dt><dd>{rawToDecimal(tokenBalance || "0", context?.tokenDecimals ?? 6)}</dd></div>
    </dl>}
    {venue === "cpmm" ? <p className="gp-trade-meta">Graduated. This order uses the Raydium CPMM pool. It is not sent to the bonding curve.</p> : <div className="gp-trade-curve" aria-label="Bonding-curve progress">
      <span>Bonding curve {curveProgress.toFixed(1)}%</span>
      <span className="gp-trade-meter"><i style={{ width: `${Math.max(0, Math.min(100, curveProgress))}%` }} /></span>
      <small>{sol(quote?.raisedLamports ?? raisedLamports)} raised of {sol(quote?.targetLamports ?? targetLamports)}</small>
    </div>}
    <label className="gp-trade-amount">{side === "buy" ? "Devnet SOL to spend" : `${ticker} to sell`}
      <input value={amount} inputMode="decimal" autoComplete="off" onChange={event => { setAmount(event.target.value); setError(""); clearQuote(); }} />
    </label>
    {side === "buy" ? <div className="gp-trade-chips" role="group" aria-label="Buy amounts">{choices.map(choice => <button type="button" key={choice.sol} aria-pressed={amount === choice.sol} disabled={choice.disabled} title={choice.reason} onClick={() => { setAmount(choice.sol); setError(""); clearQuote(); }}>{choice.sol}</button>)}{graduationSpend ? <button type="button" aria-pressed={amount === rawToDecimal(graduationSpend, 9)} onClick={() => { setAmount(rawToDecimal(graduationSpend, 9)); setError(""); clearQuote(); }}>Finish curve</button> : null}</div> : <div className="gp-trade-chips" role="group" aria-label="Sell test amounts">{SELL_TEST_AMOUNTS.map(tokens => <button type="button" key={tokens} aria-pressed={amount === tokens} onClick={() => { setAmount(tokens); setError(""); clearQuote(); }}>{tokens}</button>)}</div>}
    {side === "buy" && venue !== "cpmm" && room ? <p className="gp-trade-meta">{suggestedBuy ? `Suggested ${suggestedBuy} SOL. This curve has ${sol(room)} left.` : `This curve has ${sol(room)} left. Spending only that amount does not finish the curve, because the trading fees are taken out of the buy.`}</p> : null}
    {venue === "cpmm" && cpmmBuy?.tradable && cpmmBuy.minimumLamports && cpmmBuy.maximumLamports ? <p className="gp-trade-meta">This pool holds {sol(cpmmBuy.solReserve)}. Buys from {sol(cpmmBuy.minimumLamports)} to {sol(cpmmBuy.maximumLamports)} stay under the 5.00% price-impact limit.{choices.some(choice => choice.sol === "0.00001" && choice.disabled) ? " 0.00001 SOL is above that limit for this pool." : ""}</p> : null}
    {overImpact && cpmmBuy?.maximumLamports ? <p className="gp-trade-warn" role="alert">Price impact for this amount is above the 5.00% Devnet limit in this pool. The largest buy still under the limit is {sol(cpmmBuy.maximumLamports)}. No order was created.</p> : null}
    {underMin && cpmmBuy?.minimumLamports ? <p className="gp-trade-warn" role="alert">That amount is smaller than the smallest buy this pool can quote under the 5.00% limit ({sol(cpmmBuy.minimumLamports)}).</p> : null}
    {buyClosed ? <p className="gp-trade-warn" role="alert">This pool cannot quote a buy under the 5.00% price-impact limit. Buy stays off.</p> : null}
    {overCurve && venue !== "cpmm" ? <p className="gp-trade-warn">This amount is larger than the SOL left on the curve. Review quotes only what the curve can accept. A buy that finishes the remaining tokens changes the pool to Migrating. It does not create the Raydium CPMM pool.</p> : null}
    {graduationSpend && amount === rawToDecimal(graduationSpend, 9) ? <p className="gp-trade-warn">Finish curve spends {sol(graduationSpend)}. The quoted fees are inside that amount. A Devnet simulation of this buy changes the pool to Migrating and does not create a CPMM pool. Nothing is sent until you approve it in your wallet.</p> : null}
    <div className="gp-trade-slip" role="group" aria-label="Slippage">
      {(["0.5", "1", "2"] as const).map(preset => <button type="button" key={preset} aria-pressed={slippageMode === preset} onClick={() => { setSlippageMode(preset); setError(""); clearQuote(); }}>{preset}%</button>)}
      <button type="button" aria-pressed={slippageMode === "custom"} onClick={() => { setSlippageMode("custom"); setError(""); clearQuote(); }}>Custom</button>
    </div>
    {slippageMode === "custom" ? <label className="gp-trade-custom">Custom slippage %
      <input value={customSlippage} inputMode="decimal" onChange={event => { setCustomSlippage(event.target.value); setError(""); clearQuote(); }} />
    </label> : null}
    {slippageError ? <p role="alert">{slippageError}</p> : null}
    {warning ? <p className="gp-trade-warn">{warning}</p> : null}
    <p className="gp-trade-meta">Slippage is the worst price this transaction will accept. It is not the trading fee.</p>
    {side === "buy" && cpmmBuy?.tradable && cpmmBuy.preset && amount === presetSol && slippageReady && !quote ? <dl className="gp-trade-preview">
      <div><dt>Spend</dt><dd>{presetSol} SOL</dd></div>
      <div><dt>Estimated receive</dt><dd>{rawToDecimal(cpmmBuy.preset.expectedOut, context?.tokenDecimals ?? 6)} {ticker}</dd></div>
      <div><dt>Minimum after slippage</dt><dd>{rawToDecimal(((BigInt(cpmmBuy.preset.expectedOut) * BigInt(10000 - ("bps" in slippage ? slippage.bps : 100))) / BigInt(10000)).toString(), context?.tokenDecimals ?? 6)} {ticker}</dd></div>
      <div><dt>Trade fee</dt><dd>{cpmmBuy.preset.tradeFee} lamports</dd></div>
      <div><dt>Creator fee</dt><dd>{cpmmBuy.preset.creatorFee} raw tokens</dd></div>
      <div><dt>Price impact</dt><dd>{cpmmBuy.preset.priceImpact ?? "—"}</dd></div>
      <div><dt>Network fee</dt><dd>Shown after simulation, before wallet approval</dd></div>
    </dl> : null}
    {quote ? <dl className="gp-trade-preview">
      <div><dt>{quote.side === "buy" ? "You spend" : "You sell"}</dt><dd>{quote.side === "buy" ? sol(quote.amountIn) : `${rawToDecimal(quote.amountIn, 6)} ${ticker}`}</dd></div>
      <div><dt>Estimated receive</dt><dd>{quote.side === "buy" ? `${rawToDecimal(quote.expectedOut, 6)} ${ticker}` : sol(quote.expectedOut)}</dd></div>
      <div><dt>Minimum after {slippageMode === "custom" ? customSlippage : slippageMode}% slippage</dt><dd>{quote.side === "buy" ? `${rawToDecimal(quote.minimumOut, 6)} ${ticker}` : sol(quote.minimumOut)}</dd></div>
      {quote.feeNote ? <div><dt>Trading fees</dt><dd>{quote.feeNote}</dd></div> : <div><dt>Trading fees</dt><dd>{formatFeePercent(quote.fees.platform)} platform · {formatFeePercent(quote.fees.creator)} creator · {formatFeePercent(quote.fees.protocol)} protocol</dd></div>}
      {quote.feeNote ? null : <div><dt>This quote’s fees</dt><dd>{sol(quote.split.platform)} · {sol(quote.split.creator)} · {sol(quote.split.protocol)}</dd></div>}
      <div className={priceImpactDecision(quote.priceImpact).level === "high" ? "gp-trade-impact-row" : undefined}><dt>Price impact</dt><dd>{quote.priceImpact ?? "unavailable"}</dd></div>
      <div><dt>Wallet balance</dt><dd>{sol(quote.solLamports)}</dd></div>
      <div><dt>Network fee</dt><dd>{sol(String(quote.networkFeeLamports))}</dd></div>
      {quote.requestedAmount !== quote.amountIn ? <div><dt>Curve limit</dt><dd>The curve accepts {sol(quote.amountIn)} of the {sol(quote.requestedAmount)} entered.</dd></div> : null}
    </dl> : null}
    {quote && priceImpactDecision(quote.priceImpact).level === "high" ? <p className="gp-trade-impact" role="alert">High price impact of {quote.priceImpact}. You would receive less than the pool price. Check the estimated receive, the minimum output, and the network fee above. Nothing is submitted until you approve this trade in your wallet.</p> : null}
    {quote?.graduates ? <p className="gp-trade-warn">This quote finishes the tokens still for sale. Simulation of this buy changes the pool to Migrating. It does not create the Raydium CPMM pool, and this page will not send another bonding-curve order after it confirms. Nothing is submitted until you approve it in your wallet.</p> : null}
    <p className="gp-trade-meta" role="status">{statusText}</p>
    {error ? <p role="alert">{error}</p> : null}
    {signature ? <p role="status">Confirmed on Devnet. <a href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer">View the transaction</a></p> : null}
    <button className="gp-button gp-button-gold gp-trade-submit" type="submit" disabled={disabled} aria-busy={busy}>{label}</button>
    {phase === "confirmed" ? <button type="button" className="gp-sol-text-link" onClick={() => { setQuote(null); setSignature(""); setPhase("idle"); }}>Trade again</button> : null}
  </form>;
}
