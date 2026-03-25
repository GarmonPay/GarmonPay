"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const earnMethods = [
  {
    title: "Watch Ads",
    reward: "Earn up to $0.05 per ad",
    note: "Anti-cheat fingerprinting note: duplicate ad views are blocked.",
  },
  { title: "Click Tasks", reward: "Earn up to $0.10 per click", note: "Micro actions that reward fast engagement." },
  { title: "Play Games", reward: "Earn up to $1.00", note: "Skill based game rewards with instant tracking." },
  { title: "Daily Tasks", reward: "Earn up to $2.00", note: "Daily task streaks with consistent payout potential." },
  { title: "Refer People", reward: "Earn up to $25 per referral", note: "Stack join and upgrade commissions from your link." },
  { title: "GPay Token", reward: "Coming soon", note: "Early ecosystem rewards and premium utility." },
];

const protections = [
  "Browser fingerprinting no duplicate ad views",
  "Server-side view timer validation",
  "Bot and VPN detection",
  "Anomaly scoring flags suspicious accounts",
  "JWT-secured endpoints",
  "Every transaction logged in Supabase",
];

const referralTiers = [
  { label: "Free Referral", amount: 2 },
  { label: "Basic Upgrade", amount: 5 },
  { label: "Pro Upgrade", amount: 15 },
  { label: "Elite Upgrade", amount: 25 },
];

const planCommissions = {
  basic: 5,
  pro: 15,
  elite: 25,
} as const;

type Plan = keyof typeof planCommissions;

export default function HomePage() {
  const [friendsPerMonth, setFriendsPerMonth] = useState(20);
  const [upgradeRate, setUpgradeRate] = useState(35);
  const [plan, setPlan] = useState<Plan>("pro");

  const calculated = useMemo(() => {
    const joinBonuses = friendsPerMonth * 2;
    const upgraded = Math.round((friendsPerMonth * upgradeRate) / 100);
    const upgradeCommissions = upgraded * planCommissions[plan];
    const passiveAdShare = friendsPerMonth * 1.5;
    const total = joinBonuses + upgradeCommissions + passiveAdShare;
    return { joinBonuses, upgraded, upgradeCommissions, passiveAdShare, total };
  }, [friendsPerMonth, upgradeRate, plan]);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-14 px-4 pb-20 pt-10 md:px-6">
      <section className="relative overflow-hidden rounded-3xl border border-[#f5c842]/20 bg-[#130324]/85 px-6 py-14 md:px-10 md:py-16">
        <div className="absolute -left-10 top-5 h-52 w-52 animate-float rounded-full bg-gradient-to-br from-[#7c3aed]/35 to-transparent blur-2xl" />
        <div className="absolute left-1/2 top-3 h-44 w-44 -translate-x-1/2 animate-float rounded-full bg-gradient-to-br from-[#f5c842]/30 to-transparent blur-2xl [animation-delay:0.8s]" />
        <div className="absolute -right-14 bottom-0 h-56 w-56 animate-float rounded-full bg-gradient-to-br from-[#9b5cff]/40 to-transparent blur-2xl [animation-delay:1.2s]" />

        <div className="relative z-10 text-center animate-fadeUp">
          <span className="gp-badge-gold">Now Live Join 10000 plus Members Earning Daily</span>
          <h1 className="font-cinzel gp-gradient-text mt-5 text-4xl font-bold leading-tight md:text-6xl">
            Get Seen Get Known Get Paid
          </h1>
          <p className="font-cormorant mx-auto mt-4 max-w-3xl text-xl italic text-[#ead9ff] md:text-3xl">
            Build visibility, referral momentum, and daily payout potential from one secure growth platform.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="gp-btn-gold">Start Earning Free</Link>
            <Link href="/pricing" className="gp-btn-outline">View Plans</Link>
          </div>
        </div>

        <div className="relative z-10 mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          {["$1.2M+ Paid to Members", "10K+ Active Earners", "99.9% Uptime", "$0 To Join"].map((stat) => (
            <div key={stat} className="gp-card p-4 text-center text-sm font-semibold md:text-base">
              {stat}
            </div>
          ))}
        </div>
      </section>

      <section className="animate-fadeUp">
        <h2 className="font-cinzel text-3xl text-[#f5dea1]">Choose Your Earning Route</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {earnMethods.map((method) => (
            <article key={method.title} className="gp-card p-5">
              <h3 className="font-cinzel text-xl text-[#f9e4a6]">{method.title}</h3>
              <p className="mt-2 font-semibold text-[#e6d7ff]">{method.reward}</p>
              <p className="mt-2 text-sm text-[#ccbce3]">{method.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[#7c3aed]/45 bg-gradient-to-br from-[#1b0830] via-[#140424] to-[#0d0218] p-6 md:p-8">
        <h2 className="font-cinzel text-3xl text-[#f6de9d]">Security and Anti-Cheat</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {protections.map((item) => (
            <div key={item} className="gp-card px-4 py-3 text-sm md:text-base">
              <span className="mr-2 text-[#f5c842]">●</span>
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-[#f5c842]/45 bg-[#1a062b] p-7 md:p-10">
        <div className="absolute left-0 right-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#f5c842] to-transparent" />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(245,200,66,0.12) 0 10px, transparent 10px 22px)" }}
        />
        <div className="relative z-10">
          <div className="mb-3 text-3xl animate-float">🤝</div>
          <h2 className="font-cinzel text-3xl text-[#fbe7ab] md:text-4xl">Refer Friends Stack Commissions</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {referralTiers.map((tier) => (
              <div key={tier.label} className="gp-card p-4 text-center">
                <p className="text-sm text-[#cfbee8]">{tier.label}</p>
                <p className="mt-2 text-2xl font-bold text-[#f5c842]">${tier.amount.toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/referral" className="gp-btn-gold">Get My Referral Link</Link>
            <Link href="/referral#how-it-works" className="gp-btn-outline">How It Works</Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-cinzel text-3xl text-[#f5dfa0]">Income Calculator</h2>
        <div className="gp-card mt-5 p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-[#ddcaf5]">Friends referred per month: {friendsPerMonth}</label>
              <input
                type="range"
                min={0}
                max={300}
                value={friendsPerMonth}
                onChange={(event) => setFriendsPerMonth(Number(event.target.value))}
                className="mt-2 w-full accent-[#f5c842]"
              />
              <label className="mt-5 block text-sm font-semibold text-[#ddcaf5]">
                Friends who upgrade: {upgradeRate}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={upgradeRate}
                onChange={(event) => setUpgradeRate(Number(event.target.value))}
                className="mt-2 w-full accent-[#7c3aed]"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-[#ddcaf5]">Plan Selector</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setPlan("basic")} className={`gp-btn-outline ${plan === "basic" ? "ring-2 ring-[#f5c842]/55" : ""}`}>
                  Basic ($5)
                </button>
                <button type="button" onClick={() => setPlan("pro")} className={`gp-btn-purple ${plan === "pro" ? "ring-2 ring-[#f5c842]/55" : ""}`}>
                  Pro ($15)
                </button>
                <button type="button" onClick={() => setPlan("elite")} className={`gp-btn-outline ${plan === "elite" ? "ring-2 ring-[#f5c842]/55" : ""}`}>
                  Elite ($25)
                </button>
              </div>
            </div>
          </div>

          <div className="mt-7 overflow-x-auto">
            <table className="gp-table">
              <thead>
                <tr>
                  <th>Earnings Type</th>
                  <th>Formula</th>
                  <th>Monthly Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Join bonuses</td>
                  <td>{friendsPerMonth} × $2.00</td>
                  <td>${calculated.joinBonuses.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Upgrade commissions</td>
                  <td>{calculated.upgraded} × ${planCommissions[plan].toFixed(2)}</td>
                  <td>${calculated.upgradeCommissions.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Passive ad share</td>
                  <td>{friendsPerMonth} × $1.50</td>
                  <td>${calculated.passiveAdShare.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-5 text-right text-3xl font-extrabold text-[#f5c842]">
            Total: ${calculated.total.toFixed(2)}
          </p>
          <p className="mt-2 text-xs text-[#c8b7df]">
            Disclaimer: earnings are estimates and can vary by referral quality, anti-cheat validation, and platform activity.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-[#f5c842]/30 bg-[#140425]/80 p-7 text-center md:p-10">
        <div className="text-4xl animate-float">🪙</div>
        <h2 className="font-cinzel gp-gradient-text mt-3 text-3xl md:text-4xl">GPay Token Coming Soon</h2>
        <p className="mx-auto mt-3 max-w-3xl text-[#dbcaf0]">
          Get ready for utility-based rewards, staking incentives, in-app spending, and governance-ready participation.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="gp-badge-gold">Early Access Allocation</span>
          <span className="gp-badge-gold">Staking Rewards</span>
          <span className="gp-badge-gold">In-App Spending</span>
          <span className="gp-badge-gold">Governance Voting</span>
        </div>
        <div className="mt-7">
          <Link href="/register" className="gp-btn-gold">Reserve My Token Spot</Link>
        </div>
      </section>
    </main>
  );
}
