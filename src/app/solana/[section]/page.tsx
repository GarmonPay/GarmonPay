import Link from "next/link";
import { notFound } from "next/navigation";
import { WalletSignIn } from "@/components/solana/WalletSignIn";
import { Spotlight } from "@/components/solana/Spotlight";
import { FeeSchedule } from "@/components/solana/FeeSchedule";
import { FeatureStatus } from "@/components/solana/SolanaSurface";
import { AdvertiseWorkspace, DashboardWorkspace, EarnWorkspace, LaunchpadWorkspace, ReferralsWorkspace, TradeWorkspace } from "@/components/solana/PlatformWorkspace";
import { CreateCoin } from "@/components/solana/CreateCoin";
const sections = {
  launchpad: { title: "Launch with a clear curve.", intro: "Confirmed Devnet coins are listed here. Bonding-curve buys and sells are on each coin page. Mainnet trading stays off.", heading: "", detail: "" },
  create: { title: "Create a coin.", intro: "Solana Devnet. A new mint is created for each coin.", heading: "", detail: "" },
  trade: { title: "Discover markets. Understand the trade.", intro: "Devnet bonding-curve trades open from a coin page. Mainnet trading stays off.", heading: "Mainnet execution remains paused", detail: "A Devnet buy or sell is prepared, simulated, and signed by your wallet. No price, volume, or market cap is invented. Mainnet trading, deposits, and withdrawals stay disabled." },
  earn: { title: "Curiosity has a place here.", intro: "Watch & Earn and Learn & Earn · verified participation", heading: "Clear rules before rewards", detail: "Activity must be verified, advertiser funding confirmed and reward reserves reconciled. Rewards are not guaranteed. Pending eligibility is distinct from an available balance; legacy GPC is not SOL." },
  advertise: { title: "Meet the people behind the wallets.", intro: "Prepaid advertising · verified eligible views", heading: "Campaign funding is not open yet", detail: "Advertising remains separate from token trading and wallet custody. Crypto quotes must disclose the exact amount, expiry and conversion source. Duplicate payment receipts cannot credit a campaign twice. No subscription is required by the proposed prepaid model." },
  watch: { title: "Watch with purpose.", intro: "Watch & Earn · advertiser-funded participation", heading: "No active SOL campaigns yet", detail: "Server-controlled verification, anti-bot checks and duplicate protection are required. A review can be positive, neutral or negative. Compensated participation will be disclosed. No token purchase or favorable opinion is required." },
  learn: { title: "Understand the project. Test what you know.", intro: "Learn & Earn · sponsored education", heading: "Educational campaigns are preparing", detail: "Read project materials and answer factual questions to qualify for supported funded rewards. Rewards carry token risk and never require a purchase or favorable opinion. Distribution awaits reserve, fraud and compliance checks." },
  dashboard: { title: "Your GarmonPay, in one place.", intro: "Free features and saved progress on this device", heading: "An ecosystem opening in stages", detail: "Preparing a project or exploring a feature does not create a token, charge a fee or credit a financial balance." },
  wallet: { title: "Your wallet stays yours.", intro: "Phantom and Solflare · secure sign-in architecture", heading: "Sign in to open My Dashboard", detail: "Wallet ownership is a server-issued, expiring challenge and a verified signature. Sign-in does not authorize a transaction. If Phantom says a request is blocked, stop. Never share private keys or seed phrases." },
  earnings: { title: "Your SOL earnings", intro: "Verified participation. Clear accounting.", heading: "SOL balances are not active yet", detail: "Legacy GPC and USD balances are not converted or represented as SOL. New balances will reflect only verified, funded earnings after accounting and payout controls are approved." },
  withdraw: { title: "Withdraw to your verified wallet", intro: "SOL withdrawals · activation pending", heading: "Withdrawals are unavailable", detail: "Minimums and fees remain proposals until pricing, custody, payout authorization and reconciliation are approved. No withdrawal is created or signed here." },
  creators: { title: "Creator revenue", intro: "Your launches. Your verified fee history.", heading: "No creator-fee claims are available", detail: "LaunchLab can pay a creator curve fee of up to 0.50%. GarmonPay's platform fee must be larger. New platforms cannot assign the creator a post-graduation LP scale. Holder-directed rewards are not a LaunchLab distribution. Nothing can be claimed here." },
  referrals: { title: "A real introduction. A clear record.", intro: "Lifetime viewer and advertiser referrals", heading: "Referral ownership is stored with the signed wallet", detail: "Advertiser commission is 20% of the first qualifying prepaid purchase by a directly referred advertiser and 10% of every later qualifying purchase. Viewer match is a separate 100% of eligible verified viewer earnings and does not reduce the viewer’s reward. Nothing is paid while payouts are paused." },
  fees: { title: "Fees", intro: "Shown again before you confirm a trade.", heading: "", detail: "" },
  leaderboard: { title: "Top earners, from verified records.", intro: "Watch & Earn, referrals, realized trading, and eligible games", heading: "No verified earnings are published yet", detail: "Rankings will use reconciled records only. Unrealized trading gains and trading volume are not earnings. Wallet addresses and private balances stay hidden. This page does not invent scores." },
  spotlight: { title: "Discover what’s taking shape.", intro: "Verified launches and explainable discovery", heading: "Visibility with clear boundaries", detail: "Organic rankings require defensible market signals and manipulation checks. Sponsored visibility will be labeled separately and never imply endorsement or investment safety. Paid promotion remains inactive pending compliance review." },
} as const;
export default async function SolanaSection({ params, searchParams }: { params: Promise<{ section: string }>; searchParams?: Promise<Record<string,string|string[]|undefined>> }) {
  const { section } = await params;
  const query = await (searchParams ?? Promise.resolve({} as Record<string,string|string[]|undefined>));
  if (!(section in sections)) notFound();
  const key = section as keyof typeof sections;
  const s = sections[key];
  return <main id="main-content" className="gp-sol-page">
    <header className="gp-sol-section-header"><div><p className="gp-sol-eyebrow">GARMONPAY</p><h1>{s.title}</h1><p className="gp-sol-muted">{s.intro}</p></div>{key !== "dashboard" && key !== "launchpad" && key !== "fees" && key !== "create" && <WalletSignIn />}</header>
    {key === "launchpad" && <LaunchpadWorkspace initialView={query.prepare === "1" || query.create === "1" ? "Create a coin" : undefined} />}
    {key === "create" && <CreateCoin />}
    {key === "spotlight" && <Spotlight />}
    {key === "trade" && <TradeWorkspace />}
    {(key === "earn" || key === "watch" || key === "learn") && <EarnWorkspace key={key} category={key === "earn" ? undefined : key} />}
    {key === "dashboard" && <DashboardWorkspace />}
    {key === "advertise" && <AdvertiseWorkspace initialTab={query.plan === "1" ? "Saved draft" : undefined} />}
    {key === "referrals" && <ReferralsWorkspace />}
    {key === "fees" && <FeeSchedule />}
    {key !== "launchpad" && key !== "fees" && key !== "create" && <section className="gp-sol-panel gp-sol-section-space"><FeatureStatus>{key === "dashboard" ? "Free features available" : "Not available"}</FeatureStatus><h2 className="mt-4">{s.heading}</h2><p className="gp-sol-muted max-w-3xl">{s.detail}</p>
      {key === "wallet" && <div className="gp-sol-actions mt-4"><Link className="gp-button" href="/solana/learn">Open wallet safety courses</Link><Link className="gp-button" href="/login">Existing account sign-in</Link></div>}
      {key === "earnings" && <Link className="gp-button mt-4" href="/solana/withdraw">View withdrawal requirements</Link>}
      {key === "advertise" && <div className="gp-sol-actions mt-4"><Link className="gp-button" href="/solana/watch">Watch & Earn</Link><Link className="gp-button" href="/solana/learn">Learn & Earn</Link></div>}
    </section>}
  </main>;
}
