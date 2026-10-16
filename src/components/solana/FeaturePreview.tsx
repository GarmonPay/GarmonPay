import Link from "next/link";
import { ArrowUpRight, BookOpen, Eye, ShieldCheck } from "lucide-react";
import { FeatureStatus, SolanaSurface } from "./SolanaSurface";

export function EarnPreview() {
  return <div className="gp-sol-grid gp-sol-grid-two">{[
    { href: "/solana/watch", icon: Eye, title: "Watch & Earn", text: "Complete approved advertising activity. Eligibility must be verified by the server before any reward is recorded." },
    { href: "/solana/learn", icon: BookOpen, title: "Learn & Earn", text: "Explore educational content and complete its factual verification requirements. No purchase or favorable opinion required." },
  ].map(({ href, icon: Icon, title, text }) => <SolanaSurface key={href} title={title} description={text}>
    <Icon className="gp-sol-preview-icon" size={28} aria-hidden="true" /><FeatureStatus>Rewards paused</FeatureStatus>
    <Link href={href} className="gp-sol-text-link">View requirements <ArrowUpRight size={16} aria-hidden="true" /></Link>
  </SolanaSurface>)}</div>;
}

export function TradePreview() {
  return <div className="gp-sol-grid gp-sol-trade-grid">
    <SolanaSurface title="Markets built on verified data" description="Prices, volume, liquidity and curve progress will appear only when a supported data source has been validated.">
      <div className="gp-sol-market-status"><ShieldCheck size={32} aria-hidden="true" /><h3>Market data is not connected</h3><p className="gp-sol-muted">No tokens are ranked or quoted in this preview. Listing will never establish that a token is safe.</p></div>
      <Link href="/solana/spotlight" className="gp-sol-text-link">Explore discovery <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </SolanaSurface>
    <SolanaSurface title="Trade preview" description="Buying and selling are unavailable. No transaction can be prepared, signed or submitted here.">
      <FeatureStatus>Trading paused</FeatureStatus>
      <fieldset disabled className="gp-sol-preview-form"><legend>Order controls · unavailable</legend>
        <label>Token<select defaultValue=""><option value="">Verified markets pending</option></select></label>
        <label>Amount in SOL<input type="text" placeholder="Unavailable" aria-label="Amount in SOL unavailable" /></label>
        <label>Slippage<select defaultValue=""><option value="">Quote verification pending</option></select></label>
        <button type="button" className="gp-button gp-button-gold">Trading unavailable</button>
      </fieldset><p className="gp-sol-disclosure">Network costs, protocol fees and slippage will be disclosed in a verified quote before signing.</p>
    </SolanaSurface>
  </div>;
}

export function DashboardPreview() {
  return <>
    <div className="gp-sol-grid gp-sol-grid-two">
      <SolanaSurface title="SOL account" description="Wallet sign-in is paused. No verified SOL session or account balance is available."><FeatureStatus>Not connected</FeatureStatus><Link href="/solana/wallet" className="gp-sol-text-link">Wallet requirements <ArrowUpRight size={16} aria-hidden="true" /></Link></SolanaSurface>
      <SolanaSurface title="Existing account history" description="Older account records remain separate. This page does not convert or change balances."><Link href="/login" className="gp-button">Open legacy account</Link></SolanaSurface>
    </div>
    <SolanaSurface title="Activation status" className="gp-sol-section-space" description="Launches, trading, advertising payments, rewards, referrals and withdrawals remain paused. Security review and explicit activation approval are required.">
      <div className="gp-sol-actions"><Link href="/solana/launchpad" className="gp-button">Prepare a launch</Link><Link href="/solana/earn" className="gp-button">Explore participation</Link></div>
    </SolanaSurface>
  </>;
}

export function AdvertisePreview() {
  return <SolanaSurface title="Prepaid campaigns. Clear allocation." description="New campaign plans use one-time packages with a minimum of 1,000 verified eligible views. Crypto funding, top-ups and reward allocation remain unavailable.">
    <div className="gp-sol-grid gp-sol-commercial-grid">{[
      { label: "5-second click", price: "$3", reward: "$0.0003" },
      { label: "15-second view", price: "$8", reward: "$0.001" },
      { label: "30-second view", price: "$15", reward: "$0.002" },
    ].map(p => <article key={p.label}><p className="gp-sol-eyebrow">{p.label}</p><h3>{p.price}<small> / 1,000 views</small></h3><p className="gp-sol-muted">Proposed eligible reward: {p.reward} per view.</p></article>)}</div>
    <p className="gp-sol-disclosure">Preliminary commercial targets, not a live quote or approved payout schedule. Existing catalog pricing is preserved. A 60-second package, pricing approval, crypto exchange quote and reconciliation requirements must be reviewed before checkout.</p>
    <button type="button" disabled className="gp-button gp-button-gold">Campaign funding paused</button>
  </SolanaSurface>;
}
