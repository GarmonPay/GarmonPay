import Link from "next/link";
import { ArrowUpRight, BookOpen, Compass, Gamepad2, Layers3, Play, Rocket, ShieldCheck, Wallet } from "lucide-react";
import { Spotlight } from "./Spotlight";
import { WalletSignIn } from "./WalletSignIn";
import { FeatureStatus } from "./SolanaSurface";
const entrypoints = [
  { href: "/solana/launchpad", icon: Rocket, label: "CREATE", title: "Your idea. Your token.", text: "Prepare your next Solana project. Review the details, costs and launch requirements before any transaction." },
  { href: "/solana/trade", icon: Compass, label: "TRADE", title: "Markets, without invented prices.", text: "Search and trading stay closed until a supported route, simulation, and reconciliation pass review." },
  { href: "/solana/earn", icon: Play, label: "EARN", title: "Watch and learn, when funded.", text: "Verified views and courses will pay only from funded campaigns. No reward balance is shown until it is reconciled." },
  { href: "/solana/advertise", icon: Compass, label: "REACH", title: "Find your community.", text: "Compare prepaid packages of 1,000 views or clicks, from $9.99 to $24.99. There is no subscription. Funding remains paused." },
  { href: "/member", icon: Wallet, label: "MEMBERS", title: "A profile for your wallet.", text: "Connect and sign in to open My Dashboard. Usernames, referrals, and paper trading stay tied to that signed wallet." },
  { href: "/games", icon: Gamepad2, label: "PLAY", title: "Games already in the product.", text: "Free Connect Four is open. Paid entry and prize modes stay disabled until their rules are approved." },
  { href: "/solana/referrals", icon: ShieldCheck, label: "REFERRALS", title: "One introduction. Two programs.", text: "Advertiser commission is 10% on the first eligible purchase and 5% after that. Viewer match is a separate 50%. Payouts are not active." },
  { href: "/solana/leaderboard", icon: Layers3, label: "EARNERS", title: "Rankings from real records.", text: "No scores are published until verified earnings exist. Volume and unrealized gains are not earnings." },
  { href: "/solana/fees", icon: BookOpen, label: "FEES", title: "See the caps first.", text: "A basic launch fee is not charged. LaunchLab caps a platform fee at 5% and a creator fee at 0.50%." },
];
export function SolanaHome() {
  return <main id="main-content" className="gp-sol-page">
    <section className="gp-sol-hero"><div>
      <p className="gp-sol-eyebrow">GARMONPAY / BUILT AROUND SOLANA</p>
      <FeatureStatus>Learn and play now · financial features paused</FeatureStatus>
      <h1>Discover Crypto.<br />Build What’s<br /><span>Next.</span></h1>
      <p className="gp-sol-hero-copy">A home for creators and curious people. Plan your advertising, learn wallet essentials, play free Connect Four and prepare your next project.</p>
      <div className="gp-sol-actions">
        <Link href="/solana/advertise" className="gp-button gp-button-gold">Plan a campaign <ArrowUpRight size={18} aria-hidden="true" /></Link>
        <Link href="/solana/learn" className="gp-button">Start free learning <BookOpen size={18} aria-hidden="true" /></Link>
      </div>
      <p className="gp-sol-hero-disclosure">Wallet sign-in opens My Dashboard. Launches, Mainnet trading, and reward payouts await security review.</p>
    </div><aside className="gp-sol-orbit" aria-label="Solana platform preview">
      <div className="gp-sol-orbit-label"><span className="gp-sol-eyebrow">ONE ECOSYSTEM</span><span className="gp-sol-tag">SOLANA</span></div>
      <div className="gp-sol-emblem" aria-hidden="true"><Layers3 size={66} /><strong>SOL</strong></div>
      <div className="gp-sol-orbit-note"><ShieldCheck size={19} aria-hidden="true" /><span>Your wallet. Your control.<br /><small>No private keys or seed phrases requested.</small></span></div>
      <WalletSignIn />
    </aside></section>
    <section className="gp-sol-foundation-strip" aria-label="Platform principles">
      <span><Wallet size={17} aria-hidden="true" /> Designed for user-controlled wallets</span>
      <span><ShieldCheck size={17} aria-hidden="true" /> Transparent costs and eligibility</span>
      <span><BookOpen size={17} aria-hidden="true" /> Explore without a purchase</span>
    </section>
    <section className="gp-sol-grid gp-sol-entrypoints" aria-label="Explore GarmonPay">
      {entrypoints.map(({ href, icon: Icon, label, title, text }) => <Link href={href} className="gp-sol-panel gp-sol-entry" key={href}>
        <div className="gp-sol-entry-top"><span className="gp-sol-icon-tile"><Icon size={24} aria-hidden="true" /></span><span className="gp-sol-eyebrow">{label}</span></div>
        <h2>{title}</h2><p className="gp-sol-muted">{text}</p><span>Explore <ArrowUpRight size={16} aria-hidden="true" /></span>
      </Link>)}
    </section>
    <Spotlight />
    <section className="gp-sol-panel gp-home-launch-strip gp-sol-section-space" aria-label="Launchpad preview"><span className="gp-sol-icon-tile"><Rocket size={26} aria-hidden="true" /></span><div><p className="gp-sol-eyebrow">FROM IDEA TO PROJECT</p><h2>Prepare the next chapter.</h2><p className="gp-sol-muted">Review your token metadata before a launch. A basic GarmonPay fee is not charged. Network, rent, and protocol costs still apply, and live launches remain paused.</p></div><Link className="gp-button" href="/solana/launchpad">Explore Launchpad <ArrowUpRight size={16} aria-hidden="true" /></Link></section>
    <section className="gp-sol-panel gp-home-games gp-sol-section-space" aria-label="Games showcase"><div><p className="gp-sol-eyebrow">TAKE A DIFFERENT KIND OF BREAK</p><h2>A collection built for play.</h2><p className="gp-sol-muted">Play free Connect Four with someone beside you. No account, entry fee or prize. Existing account games remain separate; their financial operations are paused.</p><Link href="/games/connect-four" className="gp-button">Play free Connect Four <Gamepad2 size={18} aria-hidden="true" /></Link></div><div className="gp-home-games-art" aria-hidden="true"><img src="/images/garmon-master/garmondrop.webp" width={640} height={426} alt="" loading="lazy" decoding="async" /></div></section>
    <section className="gp-sol-principles">
      <div><p className="gp-sol-eyebrow">PARTICIPATION WITH PRINCIPLES</p><h2>Honest feedback.<br /><span>Clear expectations.</span></h2></div>
      <div><p className="gp-sol-muted">Compensated participation will be disclosed. Rewards will never require a favorable review. Older account balances remain separate from SOL and transferable tokens.</p><Link href="/solana/learn" className="gp-sol-text-link">Open the free learning library <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
    </section>
  </main>;
}
