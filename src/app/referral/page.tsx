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

const PLAN_ROWS = [
  { id: "free" as MarketingPlanId, label: "Free", pct: 10 },
  { id: "starter" as MarketingPlanId, label: "Starter", pct: 20 },
  { id: "growth" as MarketingPlanId, label: "Growth", pct: 30 },
  { id: "pro" as MarketingPlanId, label: "Pro", pct: 40 },
  { id: "elite" as MarketingPlanId, label: "Elite", pct: 50 },
];

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
    body: "The more your referrals earn, the more you earn. Help them get started, answer their questions, and encourage them to upgrade their membership because their upgrade pays you a commission instantly.",
  },
  {
    title: "Scale Like a Business",
    body: "Once you have 10 active referrals, focus on getting them to recruit too. Your commission applies to everyone they bring in at your tier level. Think of it as building a sales team where everyone gets paid.",
  },
];

function exampleMonthlyEarnings(planPct: number, referrals = 10, avgPerRefMonth = 120): number {
  const gross = referrals * avgPerRefMonth;
  return Math.round((gross * (planPct / 100)) * 100) / 100;
}

export default function ReferralPartnerPage() {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState("");
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [bannerStyle, setBannerStyle] = useState<"gold" | "purple" | "dark">("gold");

  const [refs, setRefs] = useState(10);
  const [avgDailyPerRef, setAvgDailyPerRef] = useState(2);
  const [plan, setPlan] = useState<MarketingPlanId>("growth");

  const commissionPct = MARKETING_PLANS[plan].referralPct;

  const breakdown = useMemo(() => {
    const monthlyReferralGross = refs * avgDailyPerRef * 30;
    const daily = (monthlyReferralGross * (commissionPct / 100)) / 30;
    const weekly = daily * 7;
    const monthly = monthlyReferralGross * (commissionPct / 100);
    const yearly = monthly * 12;
    return { daily, weekly, monthly, yearly };
  }, [refs, avgDailyPerRef, commissionPct]);

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
    const text = encodeURIComponent(`Join me on GarmonPay — earn with ads, games & referrals. ${fullUrl}`);
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
            You are not just a member — you are a business partner. Every person you bring in
            earns you money forever.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-3">
        {[
          "Earn up to 50% of every dollar your referrals make",
          "No cap on how many people you can refer",
          "Get paid every time they watch an ad, complete a task, or upgrade",
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
          Higher membership = higher referral commission on the same activity.
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-[#0a0514] text-violet-300">
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Referral commission</th>
                <th className="px-4 py-3">Example monthly (10 active referrals)*</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ROWS.map((row) => (
                <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-white">{row.label}</td>
                  <td className="px-4 py-3 text-[#fde047]">{row.pct}%</td>
                  <td className="px-4 py-3 text-violet-200/90">
                    ${exampleMonthlyEarnings(row.pct).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-violet-400/90">
          *Illustrative example assuming ~$120/month gross per referral before your commission.
        </p>
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
              <span>Active referrals</span>
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
            <div className="flex justify-between text-sm text-violet-200">
              <span>Average daily earnings per referral ($)</span>
              <span className="font-mono text-[#eab308]">${avgDailyPerRef.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={20}
              step={0.1}
              value={avgDailyPerRef}
              onChange={(e) => setAvgDailyPerRef(Number(e.target.value))}
              className="mt-2 h-2 w-full cursor-pointer accent-violet-500"
            />
          </div>
          <div>
            <p className="text-sm text-violet-200">Your membership plan (commission %)</p>
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
                  {MARKETING_PLANS[id].label} ({MARKETING_PLANS[id].referralPct}%)
                </button>
              ))}
            </div>
          </div>
          <div className="mt-8 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <tbody>
                {[
                  ["Daily Income", breakdown.daily, false],
                  ["Weekly Income", breakdown.weekly, false],
                  ["Monthly Income", breakdown.monthly, false],
                  ["Yearly Income", breakdown.yearly, true],
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
                      $
                      {(val as number).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 rounded-lg border border-violet-500/20 bg-violet-950/40 px-4 py-3 text-center text-violet-100/95">
            {motivation}
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
