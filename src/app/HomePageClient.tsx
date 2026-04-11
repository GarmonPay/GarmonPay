"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Cinzel_Decorative } from "next/font/google";
import { MARKETING_PLANS, type MarketingPlanId } from "@/lib/garmon-plan-config";
import { getSessionAsync } from "@/lib/session";

const cinzelDecorative = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const EARN_METHODS = [
  {
    title: "Watch ads & earn",
    body: "Complete brand placements and video sessions that pay out to your wallet in real time.",
    icon: "▶",
  },
  {
    title: "Mini games & rewards",
    body: "Spin wheels, arcade titles, and quick-play challenges with daily bonus pools.",
    icon: "🎮",
  },
  {
    title: "Referral commissions",
    body: "Grow your network and earn tiered rewards every time your invites stay active.",
    icon: "🔗",
  },
  {
    title: "Arena & tournaments",
    body: "Compete in seasonal brackets and spectator events with prize-backed leaderboards.",
    icon: "🥊",
  },
  {
    title: "Banners & placements",
    body: "Run and monetize banner rotations across the network with transparent reporting.",
    icon: "📣",
  },
  {
    title: "Daily missions & streaks",
    body: "Stack streak multipliers by finishing missions and checking in without gaps.",
    icon: "✓",
  },
] as const;

const REFERRAL_UPGRADE_CARDS = [
  {
    title: "Starter Upgrade $9.99",
    detail: "Free members earn $1.00, Elite members earn $5.00",
  },
  {
    title: "Growth Upgrade $24.99",
    detail: "Free members earn $2.50, Elite members earn $12.50",
  },
  {
    title: "Pro Upgrade $49.99",
    detail: "Free members earn $5.00, Elite members earn $25.00",
  },
  {
    title: "Elite Upgrade $99.99",
    detail: "Free members earn $10.00, Elite members earn $50.00",
  },
  {
    title: "Referral Join Bonus",
    detail: "Plus $0.50 instantly when they sign up",
  },
] as const;

export default function HomePage() {
  const [referralCount, setReferralCount] = useState(25);
  const [hoursPerReferralDay, setHoursPerReferralDay] = useState(2);
  const [plan, setPlan] = useState<MarketingPlanId>("growth");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then((session) => {
      if (session?.email) setUserEmail(session.email);
    });
  }, []);

  const projections = useMemo(() => {
    const p = MARKETING_PLANS[plan];
    const adsPerHour = 12;
    /** Modeled gross referral earnings per day before your commission (illustrative). No cap. */
    const referralDailyGrossUsd =
      referralCount * hoursPerReferralDay * adsPerHour * p.adRatePerAd;
    const daily = referralDailyGrossUsd * (p.referralPct / 100);
    const weekly = daily * 7;
    const monthly = daily * 30;
    const yearly = daily * 365;
    return { daily, weekly, monthly, yearly };
  }, [referralCount, hoursPerReferralDay, plan]);

  function formatProjectionUsd(n: number): string {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return (
    <>
      {userEmail && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-violet-900/90 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md border-b border-violet-700/60">
          <span>
            Welcome back, <span className="text-[#fde047]">{userEmail}</span>
          </span>
          <Link
            href="/dashboard"
            className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500"
          >
            Go to Dashboard →
          </Link>
        </div>
      )}
      <style>{`
        @keyframes gp-float-a {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.45; }
          50% { transform: translate(24px, -32px) scale(1.08); opacity: 0.6; }
        }
        @keyframes gp-float-b {
          0%, 100% { transform: translate(0, 0) scale(1.05); opacity: 0.35; }
          50% { transform: translate(-30px, 20px) scale(0.95); opacity: 0.5; }
        }
        @keyframes gp-float-c {
          0%, 100% { transform: translate(0, 0); opacity: 0.4; }
          50% { transform: translate(12px, 28px); opacity: 0.55; }
        }
        .gp-orb-a { animation: gp-float-a 16s ease-in-out infinite; }
        .gp-orb-b { animation: gp-float-b 20s ease-in-out infinite 2s; }
        .gp-orb-c { animation: gp-float-c 14s ease-in-out infinite 1s; }
      `}</style>

      <main className="relative min-h-screen overflow-x-hidden bg-[#05020a] text-white">
        {/* Hero */}
        <section className="relative flex min-h-[92vh] flex-col items-center justify-center px-4 pb-24 pt-28 text-center">
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden
          >
            <div className="gp-orb-a absolute -left-20 top-20 h-72 w-72 rounded-full bg-violet-600/40 blur-[100px]" />
            <div className="gp-orb-b absolute right-0 top-40 h-96 w-96 rounded-full bg-[#eab308]/25 blur-[110px]" />
            <div className="gp-orb-c absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-purple-500/30 blur-[90px]" />
          </div>

          <div className="relative z-10 max-w-4xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.35em] text-violet-300/90">
              GarmonPay
            </p>
            <h1
              className={`${cinzelDecorative.className} mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl`}
            >
              <span className="block bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#d97706] bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(234,179,8,0.35)]">
                Get Seen
              </span>
              <span className="mt-1 block bg-gradient-to-r from-[#fde047] via-[#fbbf24] to-[#ca8a04] bg-clip-text text-transparent">
                Get Known
              </span>
              <span className="mt-1 block bg-gradient-to-r from-[#fef08a] via-[#eab308] to-[#a16207] bg-clip-text text-transparent">
                Get Rewarded
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-xl text-base text-violet-200/90 sm:text-lg">
              The only platform where you play games{" "}
              <span className="font-semibold text-violet-100">AND</span> get rewarded to engage.
              All in one.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/register"
                className="rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-6 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-violet-400 sm:px-8 sm:text-base"
              >
                <span className="hidden sm:inline">Start Earning Free — No Credit Card Needed</span>
                <span className="sm:hidden">Start Earning Free</span>
              </Link>
              <Link
                href="/pricing"
                className="rounded-xl border-2 border-[#eab308] bg-transparent px-8 py-3.5 text-base font-semibold text-[#fde047] transition hover:bg-[#eab308]/10"
              >
                View Plans
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="relative z-10 border-y border-white/[0.06] bg-[#0a0514]/90 py-14 backdrop-blur-md">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 md:grid-cols-4">
            {[
              { k: "$1.2M+", v: "Paid to members" },
              { k: "10K+", v: "Active earners" },
              { k: "99.9%", v: "Uptime" },
              { k: "$0", v: "To join" },
            ].map((s) => (
              <div key={s.v} className="text-center">
                <p className="bg-gradient-to-r from-[#fde047] to-[#eab308] bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
                  {s.k}
                </p>
                <p className="mt-2 text-sm text-violet-200/80">{s.v}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How payments work */}
        <section className="relative z-10 border-y border-white/[0.06] bg-[#080512]/95 px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <h2
              className={`${cinzelDecorative.className} text-center text-2xl font-bold text-[#fde047] md:text-3xl`}
            >
              How payments work
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-violet-200/85">
              From your first earn to money in your bank—three simple steps.
            </p>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {[
                {
                  step: "Step 1",
                  title: "You earn",
                  icon: "🪙",
                  body: "Complete actions and your balance updates in real time.",
                },
                {
                  step: "Step 2",
                  title: "You request withdrawal",
                  icon: "🏦",
                  body: "Request a payout from your dashboard whenever you hit your plan minimum.",
                },
                {
                  step: "Step 3",
                  title: "Stripe pays you",
                  icon: "stripe",
                  body: "Funds arrive in your bank account within 1 to 5 business days via Stripe.",
                },
              ].map((s) => (
                <div
                  key={s.step}
                  className="rounded-2xl border border-white/[0.08] bg-[#12081f]/90 p-6 text-center shadow-[0_0_40px_-12px_rgba(139,92,246,0.25)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">
                    {s.step}
                  </p>
                  {s.icon === "stripe" ? (
                    <div className="mt-4 flex justify-center">
                      <span className="rounded-lg bg-white px-4 py-2 text-sm font-bold tracking-tight text-[#635bff]">
                        Stripe
                      </span>
                    </div>
                  ) : (
                    <div className="mt-4 text-4xl" aria-hidden>
                      {s.icon}
                    </div>
                  )}
                  <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-violet-200/80">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust bar */}
        <section className="relative z-10 px-4 py-14">
          <div className="mx-auto max-w-6xl rounded-2xl border border-[#eab308]/30 bg-[#0a0514]/95 p-6 shadow-[inset_0_0_60px_rgba(234,179,8,0.06)] md:p-10">
            <h2
              className={`${cinzelDecorative.className} text-center text-xl font-bold text-[#fde047] md:text-2xl`}
            >
              Why members trust GarmonPay
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  emoji: "💳",
                  title: "Stripe secured payments",
                  desc: "Payouts run through Stripe—the same infrastructure trusted by major platforms.",
                },
                {
                  emoji: "🛡️",
                  title: "Anti-cheat protection",
                  desc: "Server-side validation keeps earnings fair for honest members.",
                },
                {
                  emoji: "⚡",
                  title: "Real-time earnings",
                  desc: "Watch your balance grow as you complete actions.",
                },
                {
                  emoji: "🌍",
                  title: "Worldwide members",
                  desc: "Join from supported countries and earn on your schedule.",
                },
                {
                  emoji: "🎁",
                  title: "No pay to play",
                  desc: "Free membership—no credit card required to start earning.",
                },
                {
                  emoji: "📋",
                  title: "Transparent withdrawals",
                  desc: "Every payout is logged and visible in your dashboard.",
                },
              ].map((t) => (
                <div
                  key={t.title}
                  className="rounded-xl border border-white/[0.06] bg-black/30 p-4 text-left"
                >
                  <span className="text-2xl" aria-hidden>
                    {t.emoji}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold text-white">{t.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-violet-200/75">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6 earn methods */}
        <section className="relative z-10 px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center font-serif text-3xl font-bold text-white md:text-4xl">
              Six ways to earn
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-violet-200/85">
              Mix and match streams that fit your schedule—every path pays into the same
              wallet.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {EARN_METHODS.map((m) => (
                <article
                  key={m.title}
                  className="rounded-2xl border border-white/[0.08] bg-[#12081f]/90 p-6 shadow-[0_0_40px_-12px_rgba(139,92,246,0.35)] transition hover:border-violet-500/30"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/15 text-2xl">
                    {m.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-white">{m.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-violet-200/80">
                    {m.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Anti-cheat */}
        <section className="relative z-10 border-t border-white/[0.06] bg-gradient-to-b from-[#0c0618] to-[#05020a] px-4 py-20">
          <div className="mx-auto flex max-w-6xl flex-col gap-10 lg:flex-row lg:items-center">
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-white md:text-4xl">
                Anti-cheat security
              </h2>
              <p className="mt-4 text-violet-200/85">
                Earnings stay fair with server-side validation, device signals, and
                velocity checks—bots and scripted farms do not get paid.
              </p>
              <ul className="mt-8 space-y-4 text-left text-sm text-violet-100/90">
                <li className="flex gap-3">
                  <span className="text-[#eab308]">●</span>
                  Rate limits on sessions, engagements, and payouts per account and IP.
                </li>
                <li className="flex gap-3">
                  <span className="text-[#eab308]">●</span>
                  Timing and fingerprint analysis to catch impossible watch patterns.
                </li>
                <li className="flex gap-3">
                  <span className="text-[#eab308]">●</span>
                  Fraud flags, VPN/hosting heuristics, and manual review for high-risk
                  clusters.
                </li>
                <li className="flex gap-3">
                  <span className="text-[#eab308]">●</span>
                  Arena and game telemetry cross-checked with achievements and wallet
                  history.
                </li>
              </ul>
            </div>
            <div className="flex-1 rounded-2xl border border-violet-500/20 bg-[#150d24] p-8 shadow-[inset_0_0_60px_rgba(139,92,246,0.12)]">
              <p className="font-mono text-xs uppercase tracking-widest text-violet-400">
                Live status
              </p>
              <p className="mt-4 text-2xl font-semibold text-white">Protecting payouts</p>
              <p className="mt-2 text-sm text-violet-300/80">
                Automated scoring + human escalation when patterns break trust.
              </p>
              <div className="mt-8 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[99%] rounded-full bg-gradient-to-r from-violet-500 to-[#eab308]" />
              </div>
              <p className="mt-2 text-right text-xs text-violet-400">99.9% platform uptime</p>
            </div>
          </div>
        </section>

        {/* Referral banner + tiers */}
        <section className="relative z-10 px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="rounded-2xl border-2 border-[#eab308] bg-gradient-to-br from-[#1a0f2e]/95 to-[#0c0618] p-8 shadow-[0_0_60px_-10px_rgba(234,179,8,0.35)] md:p-12">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white md:text-3xl">
                    Referral program
                  </h2>
                  <p className="mt-2 max-w-xl text-violet-200/85">
                    Earn a commission every time one of your referrals upgrades their membership. Plus $0.50 instantly when they sign up.
                  </p>
                </div>
                <Link
                  href="/register"
                  className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#eab308] px-8 py-3.5 font-semibold text-[#0c0618] transition hover:bg-[#fde047]"
                >
                  Get your link
                </Link>
              </div>
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {REFERRAL_UPGRADE_CARDS.map((t) => (
                  <div
                    key={t.title}
                    className="rounded-xl border border-[#eab308]/30 bg-black/30 p-5 text-center"
                  >
                    <p className="text-sm font-medium uppercase tracking-wider text-[#fde047]">
                      {t.title}
                    </p>
                    <p className="mt-2 text-xs text-violet-300/80">{t.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Calculator */}
        <section className="relative z-10 border-t border-white/[0.06] px-4 py-20">
          <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-[#12081f] p-8 shadow-[0_0_50px_-15px_rgba(139,92,246,0.4)] md:p-10">
            <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
              Income calculator
            </h2>
            <p className="mt-2 text-center text-sm text-violet-200/80">
              Illustrative estimate—not a guarantee. Drag sliders to explore scenarios.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {(Object.keys(MARKETING_PLANS) as MarketingPlanId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlan(id)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    plan === id
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-900/30"
                      : "border border-white/10 bg-white/5 text-violet-200 hover:border-violet-500/40"
                  }`}
                >
                  {MARKETING_PLANS[id].label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-violet-400/90">
              {MARKETING_PLANS[plan].referralPct}% referral commission · ${MARKETING_PLANS[plan].adRatePerAd.toFixed(2)} per ad earn rate
            </p>

            <div className="mt-10 space-y-8">
              <div>
                <div className="mb-2 flex justify-between text-sm text-violet-200">
                  <span>Referrals in your network (0–1000)</span>
                  <span className="font-mono text-[#eab308]">{referralCount}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  step={1}
                  value={referralCount}
                  onChange={(e) => setReferralCount(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-violet-950 accent-[#eab308]"
                />
                <p className="mt-1 text-xs text-violet-400/90">
                  Your referral network can be unlimited — model up to 1,000 here.
                </p>
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm text-violet-200">
                  <span>Average hours of activity per day per referral</span>
                  <span className="font-mono text-[#eab308]">{hoursPerReferralDay}h</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={8}
                  step={0.5}
                  value={hoursPerReferralDay}
                  onChange={(e) => setHoursPerReferralDay(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-violet-950 accent-violet-500"
                />
              </div>
            </div>

            <div className="mt-10 space-y-3 rounded-xl border border-[#eab308]/40 bg-gradient-to-br from-violet-950/80 to-[#0c0618] p-6">
              {(
                [
                  ["Daily", projections.daily],
                  ["Weekly", projections.weekly],
                  ["Monthly", projections.monthly],
                  ["Yearly", projections.yearly],
                ] as const
              ).map(([label, val]) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0 last:pb-0"
                >
                  <span className="text-sm text-violet-300">{label} (your commission)</span>
                  <span className="font-mono text-lg font-bold text-[#fde047]">
                    ${formatProjectionUsd(val)}
                  </span>
                </div>
              ))}
              <p className="pt-2 text-center text-xs leading-relaxed text-violet-300/85">
                Top GarmonPay Elite members with large active networks earn thousands per month. Your
                growth is limited only by your effort and your network.
              </p>
              <Link
                href="/register"
                className="mt-4 block text-center text-sm font-medium text-white underline underline-offset-2 hover:text-[#fde047]"
              >
                <span className="hidden sm:inline">Start Earning Free — No Credit Card Needed</span>
                <span className="sm:hidden">Start Earning Free</span>
              </Link>
            </div>
          </div>
        </section>

        {/* GPay Token */}
        <section className="relative z-10 px-4 pb-28 pt-4">
          <div className="mx-auto max-w-4xl rounded-2xl border border-violet-500/25 bg-[#0a0514] px-8 py-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-violet-400">
              Coming soon
            </p>
            <h2 className="mt-4 bg-gradient-to-r from-violet-300 via-white to-[#eab308] bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
              GPay Token
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-violet-200/85">
              A utility-first token layer for staking boosts, fee discounts, and ecosystem
              rewards—launch details will be announced here.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-violet-200">
                Whitepaper: TBA
              </span>
              <span className="rounded-full border border-[#eab308]/40 px-4 py-2 text-xs text-[#fde047]">
                Fair launch · No promises of profit
              </span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
