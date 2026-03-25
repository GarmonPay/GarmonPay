"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type DashboardTab = "earn" | "history" | "referral";

type Tx = {
  id: string;
  type: string;
  amount: number;
  status: "completed" | "pending" | "failed";
  time: string;
};

const mockTransactions: Tx[] = [
  { id: "TX-9912", type: "ad_view", amount: 5, status: "completed", time: "2m ago" },
  { id: "TX-9908", type: "withdrawal", amount: -2500, status: "pending", time: "1h ago" },
  { id: "TX-9897", type: "referral_upgrade", amount: 1500, status: "completed", time: "3h ago" },
  { id: "TX-9881", type: "click_task", amount: 10, status: "completed", time: "5h ago" },
];

const earnCards = [
  { key: "watch", icon: "▶", title: "Watch an Ad", reward: "$0.05 / view" },
  { key: "click", icon: "🖱", title: "Click Task", reward: "$0.10 / click" },
  { key: "game", icon: "🎮", title: "Play a Game", reward: "Up to $1.00" },
  { key: "daily", icon: "✅", title: "Daily Task", reward: "Up to $2.00" },
] as const;

export default function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>("earn");
  const [watchingAd, setWatchingAd] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(15);
  const [copied, setCopied] = useState(false);

  const memberName = "Alex Member";
  const memberPlan = "Pro";
  const referralCode = "GARM-A7X9";
  const referralLink = `https://garmonpay.com/r/${referralCode}`;

  const adProgress = useMemo(() => ((15 - secondsLeft) / 15) * 100, [secondsLeft]);

  function startWatchAd() {
    if (watchingAd) return;
    setWatchingAd(true);
    setSecondsLeft(15);
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setWatchingAd(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  async function copyReferral() {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-20 pt-10 md:px-6">
      <section className="gp-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[#cdbde3]">Welcome back,</p>
            <h1 className="font-cinzel text-3xl text-[#f5df9e]">{memberName}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="gp-badge-gold">{memberPlan} Plan</span>
            <button type="button" className="gp-btn-purple">Upgrade Plan</button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {[
          ["Available Balance", "$482.35", "text-[#f5c842]"],
          ["Pending", "$37.20", "text-[#dcc8f5]"],
          ["Total Earned", "$3,209.41", "text-[#d7f0e0]"],
          ["Referrals", "128", "text-[#e7d8ff]"],
          ["Ads Watched", "3,914", "text-[#e7d8ff]"],
        ].map(([label, value, className]) => (
          <div key={label} className="gp-card p-4">
            <p className="text-xs text-[#c9b8e1]">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${className}`}>{value}</p>
          </div>
        ))}
      </section>

      <button type="button" className="gp-btn-gold w-full text-lg">
        Withdraw
      </button>

      <section className="gp-card p-4">
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className={tab === "earn" ? "gp-btn-gold" : "gp-btn-outline"} onClick={() => setTab("earn")}>
            Earn Now
          </button>
          <button type="button" className={tab === "history" ? "gp-btn-gold" : "gp-btn-outline"} onClick={() => setTab("history")}>
            History
          </button>
          <button type="button" className={tab === "referral" ? "gp-btn-gold" : "gp-btn-outline"} onClick={() => setTab("referral")}>
            Referral
          </button>
        </div>
      </section>

      {tab === "earn" && (
        <section className="grid gap-4 md:grid-cols-2">
          {earnCards.map((card) => (
            <article key={card.key} className="gp-card p-5">
              <p className="text-2xl">{card.icon}</p>
              <h2 className="font-cinzel mt-3 text-2xl text-[#f5de9c]">{card.title}</h2>
              <p className="mt-1 text-[#d2c0e8]">{card.reward}</p>
              <button
                type="button"
                className="gp-btn-purple mt-4"
                onClick={card.key === "watch" ? startWatchAd : undefined}
              >
                Start
              </button>
            </article>
          ))}

          {watchingAd && (
            <div className="md:col-span-2 gp-card p-5">
              <p className="font-semibold text-[#f5df9e]">Watching Ad... {secondsLeft}s remaining</p>
              <p className="mt-1 text-sm text-[#cfbde5]">Please do not close the window while your reward is validating.</p>
              <div className="mt-3 h-3 w-full rounded-full bg-[#2f1847]">
                <div className="h-3 rounded-full bg-gradient-to-r from-[#f5c842] to-[#7c3aed] transition-all duration-700" style={{ width: `${adProgress}%` }} />
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "history" && (
        <section className="gp-card overflow-x-auto p-4">
          <table className="gp-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {mockTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.id}</td>
                  <td>{tx.type}</td>
                  <td className={tx.amount >= 0 ? "text-[#34d399]" : "text-[#f87171]"}>
                    {tx.amount >= 0 ? "+" : "-"}${Math.abs(tx.amount / 100).toFixed(2)}
                  </td>
                  <td>
                    <span className={tx.status === "completed" ? "gp-badge-gold" : "gp-badge"}>
                      {tx.status}
                    </span>
                  </td>
                  <td>{tx.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "referral" && (
        <section className="space-y-4">
          <div className="gp-card p-5">
            <p className="text-sm text-[#cfbee8]">Referral Code</p>
            <p className="font-cinzel mt-2 text-3xl text-[#f5c842]">{referralCode}</p>
            <button type="button" className="gp-btn-gold mt-4" onClick={copyReferral}>
              {copied ? "Copied" : "Copy"}
            </button>
            <p className="mt-3 break-all text-sm text-[#cfbee8]">{referralLink}</p>
            <Link href="/referral" className="gp-btn-outline mt-4">Go to Full Referral Page</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="gp-card p-4">
              <p className="text-xs text-[#cdbde3]">Total Referrals</p>
              <p className="mt-2 text-2xl font-bold text-[#f5c842]">128</p>
            </div>
            <div className="gp-card p-4">
              <p className="text-xs text-[#cdbde3]">Earned from Refs</p>
              <p className="mt-2 text-2xl font-bold text-[#34d399]">$1,204.00</p>
            </div>
            <div className="gp-card p-4">
              <p className="text-xs text-[#cdbde3]">Active Upgrades</p>
              <p className="mt-2 text-2xl font-bold text-[#e8d8ff]">37</p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
