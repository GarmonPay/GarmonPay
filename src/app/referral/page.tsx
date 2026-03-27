"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

type Plan = "free" | "starter" | "growth" | "pro" | "elite";
type UpgradePlan = "starter" | "growth" | "pro" | "elite";

const PLAN_PCT: Record<Plan, number> = {
  free: 10,
  starter: 20,
  growth: 30,
  pro: 40,
  elite: 50,
};

const UPGRADE_PRICE: Record<UpgradePlan, number> = {
  starter: 9.99,
  growth: 24.99,
  pro: 49.99,
  elite: 99.99,
};

const NEXT_PLAN: Record<Plan, Plan> = {
  free: "starter",
  starter: "growth",
  growth: "pro",
  pro: "elite",
  elite: "elite",
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReferralPartnerPage() {
  const [plan, setPlan] = useState<Plan>("free");
  const [referrals, setReferrals] = useState(25);
  const [upgradePct, setUpgradePct] = useState(10);
  const [upgradePlan, setUpgradePlan] = useState<UpgradePlan>("starter");

  const calc = useMemo(() => {
    const commissionRate = PLAN_PCT[plan];
    const joinBonuses = referrals * 0.5;
    const upgrades = Math.floor(referrals * (upgradePct / 100));
    const commissionPerUpgrade = UPGRADE_PRICE[upgradePlan] * (commissionRate / 100);
    const upgradeCommissions = upgrades * commissionPerUpgrade;
    const monthlyTotal = joinBonuses + upgradeCommissions;
    const yearly = monthlyTotal * 12;
    return {
      commissionRate,
      joinBonuses,
      upgrades,
      commissionPerUpgrade,
      upgradeCommissions,
      monthlyTotal,
      yearly,
    };
  }, [plan, referrals, upgradePct, upgradePlan]);

  const motivation = useMemo(() => {
    const m = calc.monthlyTotal;
    if (m < 50) return "You are just getting started. Share your link daily and watch your network grow.";
    if (m < 200) return "Good momentum. A few more active referrals and this becomes serious money.";
    if (m < 500) return "You are building real passive income. Keep recruiting and upgrade your plan to earn more per referral.";
    if (m < 2000) return "This is significant recurring income. You are running a real referral business with GarmonPay.";
    if (m < 5000) return "Full time income territory. You have built something most people only dream about.";
    return "Elite earner status. This is life changing residual income from membership upgrades alone.";
  }, [calc.monthlyTotal]);

  const next = NEXT_PLAN[plan];

  return (
    <main className="min-h-screen bg-[#05020a] text-white">
      <section className="mx-auto max-w-4xl px-4 py-12">
        <h1 className={`${cinzel.className} text-center text-3xl font-bold text-[#fde047] md:text-5xl`}>
          Referral Income Calculator
        </h1>

        <div className="mt-8 rounded-2xl border border-[#eab308]/40 bg-[#12081f] p-6 md:p-8">
          <p className="mb-3 text-sm text-violet-200">Your plan</p>
          <div className="flex flex-wrap gap-2">
            {(["free", "starter", "growth", "pro", "elite"] as Plan[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlan(p)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize ${
                  plan === p ? "bg-[#eab308] text-[#12081f]" : "border border-white/10 bg-white/5 text-violet-200"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-6">
            <div className="flex justify-between text-sm text-violet-200">
              <span>How many people do you refer per month</span>
              <span className="font-mono text-[#eab308]">{referrals}</span>
            </div>
            <input type="range" min={1} max={500} value={referrals} onChange={(e) => setReferrals(Number(e.target.value))} className="mt-2 h-2 w-full accent-[#eab308]" />
            <p className="mt-1 text-xs text-violet-400">No limit on your network size.</p>
          </div>

          <div className="mt-6">
            <div className="flex justify-between text-sm text-violet-200">
              <span>What percentage of your referrals upgrade</span>
              <span className="font-mono text-[#eab308]">{upgradePct}%</span>
            </div>
            <input type="range" min={1} max={100} value={upgradePct} onChange={(e) => setUpgradePct(Number(e.target.value))} className="mt-2 h-2 w-full accent-violet-500" />
          </div>

          <div className="mt-6">
            <p className="text-sm text-violet-200">Which plan they upgrade to</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["starter", "growth", "pro", "elite"] as UpgradePlan[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setUpgradePlan(p)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    upgradePlan === p ? "bg-[#eab308] text-[#12081f]" : "border border-white/10 bg-white/5 text-violet-200"
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)} ${UPGRADE_PRICE[p].toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-white/10"><td className="px-4 py-3 text-violet-300">Your commission rate</td><td className="px-4 py-3 text-right text-[#fde047]">{calc.commissionRate}%</td></tr>
                <tr className="border-b border-white/10"><td className="px-4 py-3 text-violet-300">Join bonuses this month</td><td className="px-4 py-3 text-right text-[#fde047]">${fmt(calc.joinBonuses)}</td></tr>
                <tr className="border-b border-white/10"><td className="px-4 py-3 text-violet-300">Referrals who upgrade</td><td className="px-4 py-3 text-right text-[#fde047]">{calc.upgrades}</td></tr>
                <tr className="border-b border-white/10"><td className="px-4 py-3 text-violet-300">Commission per upgrade</td><td className="px-4 py-3 text-right text-[#fde047]">${fmt(calc.commissionPerUpgrade)}</td></tr>
                <tr className="border-b border-white/10"><td className="px-4 py-3 text-violet-300">Upgrade commissions</td><td className="px-4 py-3 text-right text-[#fde047]">${fmt(calc.upgradeCommissions)}</td></tr>
                <tr className="border-b border-white/10"><td className="px-4 py-3 text-violet-300">Total monthly income</td><td className="px-4 py-3 text-right text-[#fde047]">${fmt(calc.monthlyTotal)}</td></tr>
                <tr><td className="px-4 py-3 font-bold text-[#fde047]">Yearly projection</td><td className="px-4 py-3 text-right font-bold text-[#fde047]">${fmt(calc.yearly)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="mt-8 text-center">
            <p className={`${cinzel.className} text-3xl font-bold text-[#eab308] md:text-4xl`}>
              Your Estimated Monthly Referral Income: ${fmt(calc.monthlyTotal)}
            </p>
            <p className={`${cinzel.className} mt-2 text-2xl font-bold text-[#eab308] md:text-3xl`}>
              Your Estimated Yearly Referral Income: ${fmt(calc.yearly)}
            </p>
          </div>

          <p className="mt-6 rounded-lg border border-violet-500/20 bg-violet-950/40 px-4 py-3 text-center text-violet-100">
            {motivation}
          </p>

          <p className="mt-6 text-sm text-violet-300">
            Referral commissions are paid instantly when your referral completes a membership upgrade. You also earn $0.50 when each referral first signs up. Upgrade your own plan to earn a higher percentage on every upgrade. There is no limit to how many people you can refer.
          </p>

          <Link href="/pricing" className="mt-6 block rounded-xl border border-[#eab308] bg-[#1a0f2e] p-4 hover:bg-[#21113a]">
            <p className="font-semibold text-[#fde047]">Want to earn more per referral? Upgrade your plan and increase your commission rate.</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-violet-300">Current plan</p>
                <p className="font-semibold text-white capitalize">{plan} ({PLAN_PCT[plan]}%)</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-violet-300">Next plan</p>
                <p className="font-semibold text-white capitalize">{next} ({PLAN_PCT[next]}%)</p>
              </div>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}
