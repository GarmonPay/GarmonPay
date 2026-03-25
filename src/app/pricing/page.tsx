"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Cinzel_Decorative } from "next/font/google";
import type { MembershipPlanCatalogRow } from "@/lib/membership-plans";
import {
  catalogFeaturesToStrings,
  getEmbeddedMembershipCatalog,
} from "@/lib/membership-plans";

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

function cardChrome(id: string): {
  border: string;
  badge: string | null;
  extraClass: string;
} {
  switch (id) {
    case "free":
      return { border: "border-white/15", badge: null, extraClass: "" };
    case "starter":
      return {
        border: "border-violet-500/70 ring-1 ring-violet-500/30",
        badge: null,
        extraClass: "",
      };
    case "growth":
      return {
        border: "border-[#eab308] ring-1 ring-[#eab308]/40",
        badge: null,
        extraClass: "shadow-[0_0_40px_-12px_rgba(234,179,8,0.35)]",
      };
    case "pro":
      return {
        border: "border-violet-400 ring-2 ring-[#eab308]/50",
        badge: "MOST POPULAR",
        extraClass:
          "scale-[1.02] md:scale-105 z-10 shadow-[0_0_50px_-8px_rgba(234,179,8,0.45)]",
      };
    case "elite":
      return {
        border: "border-white/20 border-2 border-[#eab308]/60",
        badge: "DIAMOND",
        extraClass: "",
      };
    default:
      return { border: "border-white/15", badge: null, extraClass: "" };
  }
}

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

function num(v: number | string): number {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

export default function PricingPage() {
  const [catalog, setCatalog] = useState<MembershipPlanCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"supabase" | "fallback">("fallback");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/membership-plans?t=${Date.now()}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        const plans = Array.isArray(data.plans) ? data.plans : [];
        if (!cancelled) {
          if (plans.length > 0) {
            setCatalog(plans as MembershipPlanCatalogRow[]);
            setSource("supabase");
          } else {
            setCatalog(getEmbeddedMembershipCatalog());
            setSource("fallback");
          }
        }
      } catch {
        if (!cancelled) {
          setCatalog(getEmbeddedMembershipCatalog());
          setSource("fallback");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const orderedPlans = useMemo(() => {
    return [...catalog].sort((a, b) => num(a.display_order) - num(b.display_order));
  }, [catalog]);

  const comparisonRows = useMemo(() => {
    if (orderedPlans.length === 0) return null;
    const headers = ["", ...orderedPlans.map((p) => p.name)];
    const priceRow = {
      label: "Monthly Price",
      values: orderedPlans.map((p) =>
        num(p.price_monthly_usd) <= 0 ? "$0" : `$${num(p.price_monthly_usd).toFixed(2)}`
      ),
    };
    const adRow = {
      label: "Ad Earn Rate",
      values: orderedPlans.map(
        (p) => `$${num(p.ad_rate_per_ad).toFixed(2)}/ad`
      ),
    };
    const refRow = {
      label: "Referral Commission %",
      values: orderedPlans.map((p) => `${num(p.referral_commission_pct).toFixed(0)}%`),
    };
    const minW = {
      label: "Withdrawal Minimum",
      values: orderedPlans.map((p) => `$${num(p.min_withdrawal_usd).toFixed(0)}`),
    };
    const tasks = {
      label: "Daily Tasks",
      values: ["Basic", "Basic + 5", "Full", "Full + priority", "Unlimited"],
    };
    const games = {
      label: "Games Access",
      values: ["—", "—", "Yes", "Yes", "Yes"],
    };
    const credit = {
      label: "Advertising Credit",
      values: ["—", "—", "$10/mo", "$25/mo", "$50/mo"],
    };
    const speed = {
      label: "Withdrawal Speed",
      values: ["Standard", "Standard", "Standard", "Priority", "Fastest"],
    };
    return { headers, rows: [priceRow, adRow, refRow, minW, tasks, games, credit, speed] };
  }, [orderedPlans]);

  return (
    <main className="min-h-screen bg-[#05020a] text-white">
      <div className="border-b border-[#eab308]/40 bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#fbbf24] px-4 py-5 text-center shadow-[0_8px_40px_-8px_rgba(234,179,8,0.45)]">
        <p className="mx-auto max-w-4xl text-base font-bold leading-snug text-[#0c0618] sm:text-lg md:text-xl">
          Free members earn from day one. Paid plans multiply your earnings. No credit card ever required to start.
        </p>
      </div>
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
          <p className="mt-2 text-xs text-violet-400/80">
            {loading
              ? "Loading plans from Supabase…"
              : source === "supabase"
                ? "Plans synced from Supabase `membership_plan_catalog` (Free always first)."
                : "Showing embedded defaults — ensure migration `20250326000002_membership_catalog_and_ad_packages.sql` is applied and API is reachable."}
          </p>
        </header>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {loading && (
            <p className="col-span-full text-center text-violet-300/90">Loading…</p>
          )}
          {!loading &&
            orderedPlans.map((p) => {
              const chrome = cardChrome(p.id);
              const feats = catalogFeaturesToStrings(p.features);
              const priceUsd = num(p.price_monthly_usd);
              const period = priceUsd <= 0 ? "forever" : "/month";
              const priceLabel = priceUsd <= 0 ? "$0" : `$${priceUsd.toFixed(2)}`;

              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col rounded-2xl border bg-[#0c0618]/80 p-6 backdrop-blur ${chrome.badge ? "pt-10" : ""} ${chrome.border} ${chrome.extraClass}`}
                >
                  {chrome.badge && (
                    <div
                      className={`absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                        chrome.badge === "MOST POPULAR"
                          ? "bg-[#eab308] text-[#0c0618] shadow-lg"
                          : "bg-gradient-to-r from-violet-600 to-violet-500 text-white"
                      }`}
                    >
                      {chrome.badge}
                    </div>
                  )}
                  <h2 className="text-xl font-bold text-white">{p.name}</h2>
                  <div className="mt-8 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-[#fde047]">{priceLabel}</span>
                    <span className="text-sm text-violet-300/80">{period}</span>
                  </div>
                  <ul className="mt-6 flex-1 space-y-3 text-sm text-violet-100/90">
                    {feats.map((f) => (
                      <li key={f} className="flex items-start">
                        {CHECK}
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    className="mt-8 block w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-violet-400 sm:text-base"
                  >
                    <span className="hidden sm:inline">Start Earning Free — No Credit Card Needed</span>
                    <span className="sm:hidden">Start Earning Free</span>
                  </Link>
                </div>
              );
            })}
        </div>

        {comparisonRows && (
          <section className="mt-20 overflow-x-auto rounded-2xl border border-white/10 bg-[#0a0514]/90">
            <h2 className="border-b border-white/10 px-6 py-4 text-lg font-semibold text-white">
              Compare plans
            </h2>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-violet-300/90">
                  {comparisonRows.headers.map((h) => (
                    <th key={h || "row"} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.rows.map((row) => (
                  <tr key={row.label} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">{row.label}</td>
                    {row.values.map((v) => (
                      <td key={`${row.label}-${v}`} className="px-4 py-3 text-violet-200/90">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

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
