import Link from "next/link";
import { notFound } from "next/navigation";
import { describeTradingFees, formatFeePercent } from "@/lib/solana/launch-fees";
import { RAYDIUM_MINT_ENDPOINT, parseRaydiumDirectory } from "@/lib/solana/raydium-directory";
import { readDevnetMarket } from "@/lib/solana/devnet-market";
import { readDevnetCoin } from "@/lib/solana/devnet-token-view";
import { TokenStage } from "@/components/solana/TokenStage";

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const dynamic = "force-dynamic";

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

export default async function ExternalTokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  if (!MINT.test(mint)) notFound();
  const endpoint = new URL(RAYDIUM_MINT_ENDPOINT);
  endpoint.searchParams.set("ids", mint);
  let token: ReturnType<typeof parseRaydiumDirectory>[number] | undefined;
  try {
    const response = await fetch(endpoint, { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "GarmonPay/1.0" } });
    if (!response.ok) throw new Error("unavailable");
    token = parseRaydiumDirectory(await response.json()).find(row => row.mint === mint);
  } catch {
    token = undefined;
  }
  const devnet = token ? null : await readDevnetCoin(mint).catch(() => null);
  const market = devnet ? await readDevnetMarket(mint).catch(() => null) : null;
  const fees = describeTradingFees();
  const progress = token ? curveProgress(token.finishingRate) : null;
  return <main id="main-content" className="gp-sol-page">
    <header className="gp-sol-section-header"><div>
      <p className="gp-sol-eyebrow">TOKEN</p>
      <h1>{token ? token.name : devnet ? devnet.name : "Token unavailable"}</h1>
      {token ? <p className="gp-market-symbol">{token.symbol} · {token.quote}</p> : devnet ? <p className="gp-market-symbol">Solana Devnet</p> : null}
    </div></header>
    {devnet ? <TokenStage mint={mint} name={devnet.name} symbol={devnet.symbol} imageUrl={devnet.imageUrl} creator={devnet.wallet} creatorName={devnet.creatorName} launchedAt={devnet.launchedAt} signature={devnet.signature} market={market} /> : null}
    {token ? <article className="gp-market-card gp-token-detail">
      {token.imageUrl ? <img className="gp-token-art" src={token.imageUrl} alt="" width={72} height={72} /> : null}
      <div className="gp-token-detail-chart">
        <div className="gp-curve" role="img" aria-label={progress == null ? "Curve progress unavailable" : `Curve ${progress.toFixed(0)} percent complete`}><i style={{ width: `${progress ?? 0}%` }} /></div>
        <p className="gp-fee-note">{progress == null ? "Curve progress is unavailable." : `${progress.toFixed(0)}% of the curve`}</p>
      </div>
      <div className="gp-market-stats">
        <p><span>Market cap</span>{compact(token.reportedMarketCap)}</p>
        <p><span>Volume</span>{compact(token.reportedVolume)}</p>
        <p><span>Start</span>{token.reportedInitPrice ?? "—"}</p>
        <p><span>Latest</span>{token.reportedEndPrice ?? "—"}</p>
      </div>
      <table className="gp-fee-sheet">
        <caption className="sr-only">Costs if trading were open</caption>
        <tbody>
          <tr><th scope="row">Platform fee</th><td>{formatFeePercent(fees.largerPlatformFee)}</td></tr>
          <tr><th scope="row">Creator fee</th><td>{formatFeePercent(fees.largerCreatorFee)}</td></tr>
          <tr><th scope="row">Protocol fee</th><td>{formatFeePercent(fees.protocolTradeFeeRate)}</td></tr>
          <tr><th scope="row">Curve total</th><td>{formatFeePercent(fees.largerAllInRate)}</td></tr>
        </tbody>
      </table>
      <p className="gp-fee-note">Trading is not open. These costs would be shown again before a transaction.</p>
      <p><Link href="/solana/fees">Full fee schedule</Link></p>
    </article> : devnet ? null : <p role="status">This token is not available.</p>}
    <p className="gp-sol-section-space"><Link href="/solana/launchpad">Back to the launchpad</Link></p>
  </main>;
}
