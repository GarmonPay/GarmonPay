"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, BookOpen, Check, ClipboardList, Gamepad2, Megaphone, ShieldCheck, Users, Wallet } from "lucide-react";
import { FeatureStatus, SolanaSurface } from "./SolanaSurface";
import { AccountMetric, Notice, PausedAction, ReviewDialog, WorkspaceEmpty, WorkspaceTabs } from "./WorkspaceUI";
import { Spotlight } from "./Spotlight";
import { ExternalLaunchDirectory } from "./ExternalLaunchDirectory";
import { DashboardStarter } from "./DashboardStarter";
import { AdvertisingPlanner } from "./AdvertisingPlanner";
import { LearningLibrary } from "./LearningLibrary";
import { CreateCoin } from "@/components/solana/CreateCoin";
import { DevnetCoinShelf } from "./DevnetCoinShelf";

const activityFilters = ["All activity", "Launches", "Advertising", "Rewards", "Referrals"] as const;

export function LaunchpadWorkspace({ initialView = "Discover tokens" }: { initialView?: "Discover tokens" | "Create a coin" } = {}) {
  const [view, setView] = useState<string>(initialView);
  return <>
    <WorkspaceTabs label="Launchpad view" options={["Discover tokens", "Create a coin"]} value={view} onChange={setView} />
    {view === "Discover tokens" ? <>
      <DevnetCoinShelf />
      <ExternalLaunchDirectory />
      <Spotlight initialCategory="GarmonPay-Launched Tokens" />
      <button type="button" className="gp-button gp-button-gold gp-sol-section-space" onClick={() => setView("Create a coin")}>Create Coin <ArrowUpRight size={16} aria-hidden="true" /></button>
    </> : <CreateCoin />}
  </>;
}

export function TradeWorkspace() {
  return <>
    <div className="gp-workspace-feature-bar"><span><ShieldCheck size={18} aria-hidden="true" /> Mainnet trading is paused</span><FeatureStatus>Devnet curve only</FeatureStatus></div>
    <SolanaSurface title="Trade a Devnet coin" description="Open a confirmed coin to review a simulated buy or sell. Your wallet signs it. Mainnet orders are not created."><DevnetCoinShelf /><div className="gp-sol-actions gp-sol-section-space"><Link href="/solana/launchpad" className="gp-button">Browse the launchpad</Link><Link href="/solana/fees" className="gp-button">View fees</Link></div></SolanaSurface>
  </>;
}

export function EarnWorkspace({ category }: { category?: "watch" | "learn" }) {
  const [view, setView] = useState(category === "learn" ? "Learn & Earn" : "Watch & Earn");
  const learning = view === "Learn & Earn";
  return <>
    {!learning && <div className="gp-account-metrics gp-sol-section-space"><AccountMetric label="Pending rewards" note="No verified SOL account" /><AccountMetric label="Available rewards" note="No verified balance" /><AccountMetric label="Withdrawal eligibility" note="Withdrawals paused" /></div>}
    <WorkspaceTabs label="Earning category" options={["Watch & Earn", "Learn & Earn"]} value={view} onChange={setView} />
    {learning && <LearningLibrary />}
    {!learning && <div className="gp-sol-grid gp-sol-grid-two"><SolanaSurface title={learning ? "Learn with confidence" : "Verified participation"} description={learning ? "Start with a short platform guide. This open lesson does not award rewards." : "Only approved, funded campaigns can offer eligible rewards."}>
      <WorkspaceEmpty title={learning ? "No funded lessons available" : "No active SOL campaigns"} description="Campaigns appear after payment confirmation, reserve review and server-controlled eligibility checks." />
      <FeatureStatus>Reward distribution paused</FeatureStatus>
    </SolanaSurface><SolanaSurface title="Your eligibility checklist" description="Participation is never a promise of earnings."><ol className="gp-workspace-checklist"><li>Verify wallet ownership after sign-in activation.</li><li>Choose an approved, funded opportunity.</li><li>Complete server-verified activity and fraud checks.</li><li>Wait for a reconciled, available reward.</li></ol><Link href="/solana/withdraw" className="gp-sol-text-link">Withdrawal requirements <ArrowUpRight size={16} aria-hidden="true" /></Link></SolanaSurface></div>}
    <SolanaSurface title="Reward history" className="gp-sol-section-space"><WorkspaceEmpty title="History requires a verified account" description="No reward records are fabricated. Existing GPC activity remains in your legacy account." /><Link href="/dashboard/earn" className="gp-sol-text-link">View legacy earning history <ArrowUpRight size={16} aria-hidden="true" /></Link></SolanaSurface>
  </>;
}

export function AdvertiseWorkspace({ initialTab }: { initialTab?: "Saved draft" } = {}) { return <AdvertisingPlanner initialTab={initialTab} />; }

export function ReferralsWorkspace() {
  return <>
    <div className="gp-workspace-feature-bar"><span>Two lifetime referral programs</span><span>Approved business model · <strong>SOL payouts paused</strong></span></div>
    <div className="gp-sol-grid gp-sol-grid-two"><SolanaSurface title="Viewer referrals" description="Lifetime match on eligible verified advertising-view earnings."><div className="gp-referral-rates"><div><strong>50%</strong><span>Of eligible referred-viewer earnings</span></div></div><p className="gp-sol-muted">The match continues while your referred viewer remains eligible and earns verified advertising rewards. It is funded separately and never reduces the viewer’s promised reward.</p><p className="gp-sol-disclosure">Free quizzes, token purchases and unverified activity do not earn this match. New SOL referral rewards and payouts are not active.</p></SolanaSurface>
    <SolanaSurface title="Advertiser referrals" description="Lifetime eligibility on qualifying prepaid advertising purchases."><div className="gp-referral-rates"><div><strong>10%</strong><span>Every qualifying purchase</span></div><div><strong>50%</strong><span>Viewer match, funded separately</span></div></div><p className="gp-sol-muted">Advertiser commission is 10% of each eligible prepaid purchase by a directly referred advertiser. Viewer matching is a separate 50% match and does not reduce the viewer’s reward. There is no multilevel chain.</p><p className="gp-sol-disclosure">Refunds, disputes, fraud and eligibility adjustments can affect commissions. Commission payments remain paused.</p></SolanaSurface></div>
    <SolanaSurface title="Your existing referral account" description="Existing account links, referrals and history remain separate from the new SOL programs." className="gp-sol-section-space"><Link href="/dashboard/referrals" className="gp-button gp-button-gold">Open existing referral dashboard <ArrowUpRight size={16} aria-hidden="true" /></Link><p className="gp-sol-muted">Your existing account may require sign-in. No new wallet referral link or SOL earnings record is created on this page.</p></SolanaSurface>
    <div className="gp-sol-grid gp-sol-section-space">{[{title:"Verified attribution",text:"No self-referrals or duplicate credit. Identity, eligibility and fraud checks must establish the qualifying referral."},{title:"Separately funded obligations",text:"Viewer rewards, viewer matches and advertiser commissions each need funded, auditable allocations."},{title:"Clear history",text:"Refunds, disputes and reversals must remain visible alongside the original eligible event. No earnings are fabricated here."}].map(item=><SolanaSurface key={item.title} title={item.title} description={item.text}/>)}</div>
  </>;
}

export function DashboardWorkspace() { return <DashboardStarter />; }
