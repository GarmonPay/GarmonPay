"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Cinzel_Decorative } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { getSessionAsync } from "@/lib/session";
import { generateReferralLink } from "@/lib/referrals";
import { MARKETING_PLANS, type MarketingPlanId } from "@/lib/garmon-plan-config";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const PLAN_ROWS: Array<{
  id: MarketingPlanId;
  label: string;
  starter: number;
  growth: number;
  pro: number;
  elite: number;
}> = [
  { id: "free", label: "Free", starter: 3, growth: 8, pro: 15, elite: 25 },
  { id: "starter", label: "Starter", starter: 4, growth: 10, pro: 18, elite: 30 },
  { id: "growth", label: "Growth", starter: 5, growth: 12, pro: 22, elite: 35 },
  { id: "pro", label: "Pro", starter: 6, growth: 15, pro: 27, elite: 42 },
  { id: "elite", label: "Elite", starter: 8, growth: 20, pro: 35, elite: 50 },
];

const REFERRAL_UPGRADE_OPTIONS = [10, 20, 30, 40, 50] as const;
type UpgradeRate = (typeof REFERRAL_UPGRADE_OPTIONS)[number];
type UpgradeTarget = "starter" | "growth" | "pro" | "elite";

const COMMISSION_BY_PLAN_AND_UPGRADE: Record<
  MarketingPlanId,
  Record<UpgradeTarget, number>
> = {
  free: { starter: 3, growth: 8, pro: 15, elite: 25 },
  starter: { starter: 4, growth: 10, pro: 18, elite: 30 },
  growth: { starter: 5, growth: 12, pro: 22, elite: 35 },
  pro: { starter: 6, growth: 15, pro: 27, elite: 42 },
  elite: { starter: 8, growth: 20, pro: 35, elite: 50 },
};

const STEPS = [
  {
    title: "Know Your Product",
    body: "Learn every feature of GarmonPay so you can explain it confidently. The more you use it, the easier it is to recruit.",
  },
  {
    title: "Start With Your Inner Circle",
    body: "Start with friends and family who trust you. Send them your personal link and explain they can earn real money for free just by signing up.",
  },
  {
    title: "Use Social Media Like a Business",
    body: "Post your referral link on Instagram, TikTok, Facebook, Twitter, and WhatsApp Status every day. Show your own earnings as proof. Consistency beats everything.",
  },
  {
    title: "Create Content That Converts",
    body: "Make short videos showing your GarmonPay dashboard and real earnings. People join what they can see working.",
  },
  {
    title: "Help Your Referrals Succeed",
    body: "Help your referrals understand the value of each plan and support them as they grow. You earn commission only when they complete membership upgrades.",
  },
  {
    title: "Scale Like a Business",
    body: "Once you have 10 active referrals, focus on helping each one convert into an upgraded member. Upgrade-focused guidance creates predictable commissions at scale.",
  },
];

export default function ReferralPartnerPage() {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState("");
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [bannerStyle, setBannerStyle] = useState<"gold" | "purple" | "dark">("gold");

  const [refs, setRefs] = useState(10);
  const [upgradeRate, setUpgradeRate] = useState<UpgradeRate>(20);
  const [upgradePlan, setUpgradePlan] = useState<UpgradeTarget>("growth");
  const [plan, setPlan] = useState<MarketingPlanId>("growth");

  const breakdown = useMemo(() => {
    const upgradesThisMonth = refs * (upgradeRate / 100);
    const commissionPerUpgrade = COMMISSION_BY_PLAN_AND_UPGRADE[plan][upgradePlan];
    const monthly = upgradesThisMonth * commissionPerUpgrade;
    const yearly = monthly * 12;
    return { upgradesThisMonth, commissionPerUpgrade, monthly, yearly };
  }, [refs, upgradeRate, plan, upgradePlan]);

  const motivation = useMemo(() => {
    const m = breakdown.monthly;
    if (m < 500)
      return "You are planting seeds. Stay consistent, keep sharing your link, and your network will grow.";
    if (m < 2000)
      return "You are building real recurring income. This is what financial freedom starts to look like.";
    if (m < 5000)
      return "This is full time income. You are running a legitimate online business with GarmonPay.";
    return "Elite earner territory. You have built something most people only dream about. Keep going.";
  }, [breakdown.monthly]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSessionAsync();
      if (!session) {
        if (!cancelled) {
          setReferralCode("GARM-XXXX");
          setFullUrl(
            `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://garmonpay.com"}/register?ref=YOUR-ID`
          );
        }
        return;
      }
      const supabase = createBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setReferralCode("GARM-XXXX");
          setFullUrl(generateReferralLink(session.userId));
        }
        return;
      }
      const { data } = await supabase
        .from("users")
        .select("referral_code")
        .eq("id", session.userId)
        .maybeSingle();
      if (!cancelled) {
        const c = (data as { referral_code?: string } | null)?.referral_code;
        setReferralCode(c ? String(c).toUpperCase() : "GARM-XXXX");
        setFullUrl(generateReferralLink(session.userId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullUrl || "");
      setCopyMsg("Copied!");
      setTimeout(() => setCopyMsg(null), 2000);
    } catch {
      setCopyMsg("Copy failed");
    }
  }, [fullUrl]);

  const share = (network: "twitter" | "facebook" | "whatsapp" | "telegram") => {
    const text = encodeURIComponent(
      `Join me on GarmonPay. When you upgrade your membership plan, I earn a referral commission instantly. ${fullUrl}`
    );
    const url = encodeURIComponent(fullUrl || "https://garmonpay.com");
    const map: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${text}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      whatsapp: `https://wa.me/?text=${text}`,
      telegram: `https://t.me/share/url?url=${url}&text=${encodeURIComponent("GarmonPay — earn together")}`,
    };
    window.open(map[network], "_blank", "noopener,noreferrer");
  };

  const displayCode = referralCode ?? "GARM-XXXX";

  const bannerPreviewClass =
    bannerStyle === "gold"
      ? "bg-gradient-to-br from-[#422006] to-[#0c0618] border-[#eab308]"
      : bannerStyle === "purple"
        ? "bg-gradient-to-br from-violet-900 to-[#0c0618] border-violet-500"
        : "bg-gradient-to-br from-[#0a0a0a] to-[#111] border-white/20";

  return (
    <main className="min-h-screen bg-[#05020a] text-white">
      {/* Hero */}
      <section className="border-b-2 border-[#eab308]/80 bg-gradient-to-b from-[#1a0a2e] to-[#0c0618] px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h1
            className={`${cinzel.className} text-3xl font-bold leading-tight text-[#fde047] sm:text-4xl md:text-5xl`}
          >
            Welcome to the GarmonPay Partner Program
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-violet-200/95">
            You are not just a member — you are a business partner. Every referral who upgrades
            their membership plan earns you an instant commission.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-3">
        {[
          "Earn up to $25 every time a referral upgrades their plan",
          "No cap on how many people you can refer",
          "Get paid instantly every time a referral upgrades",
        ].map((t) => (
          <div
            key={t}
            className="rounded-2xl border border-violet-500/25 bg-[#12081f] p-8 text-center text-lg font-medium leading-relaxed text-violet-100"
          >
            {t}
          </div>
        ))}
      </section>

      {/* Plan table */}
      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className={`${cinzel.className} text-2xl font-bold text-[#eab308] md:text-3xl`}>
          Your Earnings Depend On Your Plan
        </h2>
        <p className="mt-2 text-violet-200/85">
          Higher membership plans unlock bigger flat upgrade commissions.
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-[#0a0514] text-violet-300">
                <th className="px-4 py-3">Your Plan</th>
                <th className="px-4 py-3">Commission When Referral Upgrades to Starter</th>
                <th className="px-4 py-3">Commission When Referral Upgrades to Growth</th>
                <th className="px-4 py-3">Commission When Referral Upgrades to Pro</th>
                <th className="px-4 py-3">Commission When Referral Upgrades to Elite</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ROWS.map((row) => (
                <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-white">{row.label}</td>
                  <td className="px-4 py-3 text-[#fde047]">${row.starter.toFixed(2)}</td>
                  <td className="px-4 py-3 text-[#fde047]">${row.growth.toFixed(2)}</td>
                  <td className="px-4 py-3 text-[#fde047]">${row.pro.toFixed(2)}</td>
                  <td className="px-4 py-3 text-[#fde047]">${row.elite.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Business guide */}
      <section className="mx-auto max-w-4xl px-4 py-14">
        <h2 className={`${cinzel.className} text-center text-2xl font-bold text-[#fde047] md:text-3xl`}>
          Your Step by Step Blueprint to Earning with GarmonPay Partners
        </h2>
        <h3 className="mt-4 text-center text-lg font-semibold text-white md:text-xl">
          How To Build Your GarmonPay Business
        </h3>
        <ol className="mt-10 space-y-6">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="rounded-2xl border-2 border-[#eab308]/35 bg-[#0c0618]/95 p-6 md:p-8 shadow-[0_0_30px_-12px_rgba(234,179,8,0.2)]"
            >
              <div className="flex gap-4 md:gap-6">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#eab308] bg-[#1a0f2e] text-lg font-bold text-[#fde047] md:h-14 md:w-14 md:text-xl"
                  aria-hidden
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xl font-bold text-[#eab308]">{s.title}</h4>
                  <p className="mt-3 leading-relaxed text-violet-200/90">{s.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Calculator */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className={`${cinzel.className} text-2xl font-bold text-white md:text-3xl`}>
          Referral Income Calculator
        </h2>
        <div className="mt-6 rounded-2xl border border-[#eab308]/30 bg-[#12081f] p-6 md:p-8">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-violet-200">
              <span>Your Referral Network</span>
              <span className="font-mono text-[#eab308]">{refs}</span>
            </div>
            <input
              type="range"
              min={1}
              max={500}
              value={refs}
              onChange={(e) => setRefs(Number(e.target.value))}
              className="mt-2 h-2 w-full cursor-pointer accent-[#eab308]"
            />
            <p className="mt-1 text-xs text-violet-400">No ceiling on your network size.</p>
          </div>
          <div className="mb-6">
            <p className="text-sm text-violet-200">What percentage of your referrals upgrade each month?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REFERRAL_UPGRADE_OPTIONS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setUpgradeRate(pct)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    upgradeRate === pct
                      ? "bg-violet-600 text-white"
                      : "border border-white/10 bg-white/5 text-violet-200"
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <div className="mb-6">
            <p className="text-sm text-violet-200">Which plan do most referrals upgrade to?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["starter", "growth", "pro", "elite"] as UpgradeTarget[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setUpgradePlan(id)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${
                    upgradePlan === id
                      ? "bg-violet-600 text-white"
                      : "border border-white/10 bg-white/5 text-violet-200"
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-violet-200">Your membership plan</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(MARKETING_PLANS) as MarketingPlanId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlan(id)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    plan === id
                      ? "bg-violet-600 text-white"
                      : "border border-white/10 bg-white/5 text-violet-200"
                  }`}
                >
                  {MARKETING_PLANS[id].label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-8 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <tbody>
                {[
                  ["Number of referrals who upgrade this month", breakdown.upgradesThisMonth, false],
                  ["Commission per upgrade", breakdown.commissionPerUpgrade, false],
                  ["Monthly commission income", breakdown.monthly, false],
                  ["Yearly projection", breakdown.yearly, true],
                ].map(([label, val, isYear]) => (
                  <tr key={label as string} className="border-b border-white/5">
                    <td className="px-4 py-3 text-violet-300">{label}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        isYear
                          ? "text-xl font-bold text-[#fde047] md:text-2xl"
                          : "text-[#fde047]"
                      }`}
                    >
                      {String(label).includes("Number of referrals")
                        ? (val as number).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : `$${(val as number).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p
            className={`${cinzel.className} mt-6 text-center text-3xl font-bold text-[#fde047] md:text-4xl`}
          >
            {`$${breakdown.monthly.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
          </p>
          <p className="mt-2 text-center text-xs uppercase tracking-[0.18em] text-violet-300/80">
            Total Monthly Earnings Estimate
          </p>
          <p className="mt-6 rounded-lg border border-violet-500/20 bg-violet-950/40 px-4 py-3 text-center text-violet-100/95">
            {motivation}
          </p>
          <p className="mt-4 text-center text-xs text-violet-300/85">
            Commissions are paid instantly when your referral completes their membership upgrade.
            There is no limit to how many referrals you can have.
          </p>
        </div>
      </section>

      {/* Referral link */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-xl font-bold text-white">Your Referral Link</h2>
        <div className="mt-4 rounded-2xl border border-[#eab308]/40 bg-[#0a0514] p-6">
          <p className={`${cinzel.className} text-3xl font-bold tracking-wider text-[#eab308] md:text-4xl`}>
            {displayCode}
          </p>
          <p className="mt-3 break-all text-sm text-violet-300/90">{fullUrl || "Sign in to load your link."}</p>
          <button
            type="button"
            onClick={copyLink}
            className="mt-4 rounded-xl bg-[#eab308] px-6 py-2.5 font-semibold text-[#0c0618] hover:bg-[#fde047]"
          >
            Copy link
          </button>
          {copyMsg && <p className="mt-2 text-sm text-violet-300">{copyMsg}</p>}
          <div className="mt-6 flex flex-wrap gap-2">
            {(["twitter", "facebook", "whatsapp", "telegram"] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => share(n)}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm capitalize text-violet-200 hover:bg-white/10"
              >
                {n === "twitter" ? "Twitter / X" : n}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Banner generator */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-xl font-bold text-white">Banner Generator</h2>
        <p className="mt-2 text-sm text-violet-300/85">
          Pick a style, preview your banner with your code embedded, then save the image (screenshot)
          or use in posts.
        </p>
        <div className="mt-4 flex gap-2">
          {(["gold", "purple", "dark"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setBannerStyle(s)}
              className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
                bannerStyle === s ? "bg-violet-600 text-white" : "border border-white/10 bg-white/5"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div
          className={`mt-6 flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 p-8 text-center ${bannerPreviewClass}`}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-violet-300/80">GarmonPay</p>
          <p className="mt-2 text-2xl font-bold text-white">Earn with us</p>
          <p className={`${cinzel.className} mt-4 text-3xl text-[#eab308]`}>{displayCode}</p>
        </div>
        <p className="mt-3 text-xs text-violet-400">
          Tip: Screenshot this preview or drop your code into Canva for custom sizes.
        </p>
      </section>

      {/* Leaderboard teaser */}
      <section className="mx-auto max-w-3xl px-4 pb-24">
        <div className="rounded-2xl border border-dashed border-violet-500/40 bg-violet-950/20 p-10 text-center">
          <h2 className="text-xl font-bold text-violet-200">Referral Leaderboard</h2>
          <p className="mt-2 text-3xl font-bold text-[#eab308]">Coming Soon</p>
          <p className="mt-3 text-sm text-violet-400/90">
            Top partners will be featured here — stay tuned.
          </p>
        </div>
        <div className="mt-8 text-center">
          <Link href="/register" className="text-violet-400 underline hover:text-violet-300">
            Get started →
          </Link>
        </div>
      </section>
    </main>
  );
}
