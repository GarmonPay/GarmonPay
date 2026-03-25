"use client";

import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const CHECK = (
  <span className="text-[#eab308] mr-2 inline-block" aria-hidden>
    ✓
  </span>
);

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    border: "border-white/15",
    badge: null as string | null,
    extraClass: "",
    features: [
      "Ad rate $0.01 per ad",
      "10% referral commission on all referral earnings forever",
      "$20 minimum withdrawal",
      "Basic tasks only",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$9.99",
    period: "/month",
    border: "border-violet-500/70 ring-1 ring-violet-500/30",
    badge: null,
    extraClass: "",
    features: [
      "Ad rate $0.03 per ad",
      "20% referral commission",
      "$10 minimum withdrawal",
      "5 extra daily tasks",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: "$24.99",
    period: "/month",
    border: "border-[#eab308] ring-1 ring-[#eab308]/40",
    badge: null,
    extraClass: "shadow-[0_0_40px_-12px_rgba(234,179,8,0.35)]",
    features: [
      "Ad rate $0.05 per ad",
      "30% referral commission",
      "$5 minimum withdrawal",
      "Access to games and tasks",
      "$10 monthly advertising credit",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49.99",
    period: "/month",
    border: "border-violet-400 ring-2 ring-[#eab308]/50",
    badge: "MOST POPULAR",
    extraClass: "scale-[1.02] md:scale-105 z-10 shadow-[0_0_50px_-8px_rgba(234,179,8,0.45)]",
    features: [
      "Ad rate $0.08 per ad",
      "40% referral commission",
      "$2 minimum withdrawal",
      "Priority tasks",
      "$25 monthly advertising credit",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: "$99.99",
    period: "/month",
    border: "border-white/20 border-2 border-[#eab308]/60",
    badge: "DIAMOND",
    extraClass: "",
    features: [
      "Ad rate $0.15 per ad",
      "50% referral commission (maximum)",
      "$1 minimum withdrawal",
      "All access to every feature",
      "$50 monthly advertising credit",
    ],
  },
] as const;

const TABLE = {
  headers: ["", "Free", "Starter", "Growth", "Pro", "Elite"],
  rows: [
    {
      label: "Monthly Price",
      values: ["$0", "$9.99", "$24.99", "$49.99", "$99.99"],
    },
    {
      label: "Ad Earn Rate",
      values: ["$0.01/ad", "$0.03/ad", "$0.05/ad", "$0.08/ad", "$0.15/ad"],
    },
    {
      label: "Referral Commission %",
      values: ["10%", "20%", "30%", "40%", "50%"],
    },
    {
      label: "Withdrawal Minimum",
      values: ["$20", "$10", "$5", "$2", "$1"],
    },
    {
      label: "Daily Tasks",
      values: ["Basic", "Basic + 5", "Full", "Full + priority", "Unlimited"],
    },
    {
      label: "Games Access",
      values: ["—", "—", "Yes", "Yes", "Yes"],
    },
    {
      label: "Advertising Credit",
      values: ["—", "—", "$10/mo", "$25/mo", "$50/mo"],
    },
    {
      label: "Withdrawal Speed",
      values: ["Standard", "Standard", "Standard", "Priority", "Fastest"],
    },
  ],
};

const ROI = [
  {
    plan: "Starter",
    text: "One active referral who watches ads daily covers your subscription cost.",
  },
  {
    plan: "Growth",
    text: "Two active referrals cover your cost and the ad credit adds extra value.",
  },
  {
    plan: "Pro",
    text: "Three active referrals cover your cost and priority tasks mean faster earning.",
  },
  {
    plan: "Elite",
    text: "Five active referrals cover your cost and 50% commission means maximum passive income.",
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#05020a] text-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <header className="text-center">
          <h1
            className={`${cinzel.className} text-3xl font-bold sm:text-4xl md:text-5xl`}
          >
            <span className="bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent">
              Choose Your GarmonPay Plan
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-violet-200/90 sm:text-lg">
            Upgrade your membership and unlock higher earnings, better referral commissions,
            and faster payouts.
          </p>
        </header>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`relative flex flex-col rounded-2xl border bg-[#0c0618]/80 p-6 backdrop-blur ${p.badge ? "pt-10" : ""} ${p.border} ${p.extraClass}`}
            >
              {p.badge && (
                <div
                  className={`absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                    p.badge === "MOST POPULAR"
                      ? "bg-[#eab308] text-[#0c0618] shadow-lg"
                      : "bg-gradient-to-r from-violet-600 to-violet-500 text-white"
                  }`}
                >
                  {p.badge}
                </div>
              )}
              <h2 className="text-xl font-bold text-white">{p.name}</h2>
              <div className="mt-8 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-[#fde047]">{p.price}</span>
                <span className="text-sm text-violet-300/80">{p.period}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-violet-100/90">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start">
                    {CHECK}
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="mt-8 block w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3 text-center font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-violet-400"
              >
                Get Started
              </Link>
            </div>
          ))}
        </div>

        <section className="mt-20 overflow-x-auto rounded-2xl border border-white/10 bg-[#0a0514]/90">
          <h2 className="border-b border-white/10 px-6 py-4 text-lg font-semibold text-white">
            Compare plans
          </h2>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-violet-300/90">
                {TABLE.headers.map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TABLE.rows.map((row) => (
                <tr key={row.label} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-white">{row.label}</td>
                  {row.values.map((v) => (
                    <td key={v} className="px-4 py-3 text-violet-200/90">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-20 rounded-2xl border border-[#eab308]/30 bg-gradient-to-br from-[#1a0f2e]/95 to-[#0c0618] p-8 md:p-10">
          <h2 className={`${cinzel.className} text-2xl font-bold text-[#fde047] md:text-3xl`}>
            Why upgrading pays for itself
          </h2>
          <p className="mt-3 text-violet-200/85">
            Higher commissions and lower withdrawal minimums mean faster cash flow. Here is
            how the math works when your network stays active.
          </p>
          <ul className="mt-8 space-y-4">
            {ROI.map((r) => (
              <li
                key={r.plan}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-violet-100/90"
              >
                <span className="font-semibold text-[#eab308]">{r.plan}:</span> {r.text}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
