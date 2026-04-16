"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Cinzel_Decorative } from "next/font/google";
import type { MembershipPlanCatalogRow } from "@/lib/membership-plans";
import {
  catalogFeaturesToStrings,
  getEmbeddedMembershipCatalog,
} from "@/lib/membership-plans";
import { getSessionAsync } from "@/lib/session";
import {
  MARKETING_PLANS,
  membershipTierRank,
  normalizeUserMembershipTier,
  type MarketingPlanId,
} from "@/lib/garmon-plan-config";
import { PAID_TIER_PRICES_CENTS, isPaidTierId, type PaidMembershipTierId } from "@/lib/membership-balance-prices";
import { getMonthlyGpcBonusForPlan } from "@/lib/membership-monthly-gpc-bonus";

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

function formatUsdFromCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PricingPage() {
  const [catalog, setCatalog] = useState<MembershipPlanCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"supabase" | "fallback">("fallback");
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [balanceInfo, setBalanceInfo] = useState<{
    totalBalance: number;
    eligibleBalance: number;
    heldBalance: number;
    heldUntil: string | null;
  }>({
    totalBalance: 0,
    eligibleBalance: 0,
    heldBalance: 0,
    heldUntil: null,
  });
  const [membershipTierUi, setMembershipTierUi] = useState<MarketingPlanId>("free");
  const [dashLoading, setDashLoading] = useState(true);
  const [confirmTier, setConfirmTier] = useState<PaidMembershipTierId | null>(null);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [stripeBusyId, setStripeBusyId] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    getSessionAsync().then(async (session) => {
      if (!session || cancelled) {
        if (!cancelled) {
          setBalanceCents(null);
          setMembershipTierUi("free");
          setBalanceInfo({
            totalBalance: 0,
            eligibleBalance: 0,
            heldBalance: 0,
            heldUntil: null,
          });
          setDashLoading(false);
        }
        return;
      }
      setDashLoading(true);
      const headers: Record<string, string> = {};
      if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
      else if (session.userId) headers["X-User-Id"] = session.userId;
      try {
        const dashRes = await fetch("/api/dashboard", { headers, cache: "no-store" });
        const d = await dashRes.json().catch(() => ({}));
        if (cancelled) return;
        const bc = d.balanceCents != null ? d.balanceCents : null;
        setBalanceCents(bc);
        setMembershipTierUi(normalizeUserMembershipTier(d.membershipTier ?? "free"));

        if (session.accessToken) {
          const eligRes = await fetch("/api/membership/balance-eligibility", {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: "no-store",
          });
          const elig = await eligRes.json().catch(() => ({}));
          if (!cancelled && eligRes.ok && typeof (elig as { eligibleBalance?: number }).eligibleBalance === "number") {
            const e = elig as {
              totalBalance?: number;
              eligibleBalance?: number;
              heldBalance?: number;
              heldUntil?: string | null;
            };
            setBalanceInfo({
              totalBalance: e.totalBalance ?? 0,
              eligibleBalance: e.eligibleBalance ?? 0,
              heldBalance: e.heldBalance ?? 0,
              heldUntil: e.heldUntil ?? null,
            });
          } else if (!cancelled) {
            setBalanceInfo({
              totalBalance: bc,
              eligibleBalance: bc,
              heldBalance: 0,
              heldUntil: null,
            });
          }
        } else if (!cancelled) {
          setBalanceInfo({
            totalBalance: bc,
            eligibleBalance: bc,
            heldBalance: 0,
            heldUntil: null,
          });
        }
      } catch {
        if (!cancelled) setBalanceCents(null);
      } finally {
        if (!cancelled) setDashLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribeWithCard(tierId: string) {
    if (!isPaidTierId(tierId)) return;
    const session = await getSessionAsync();
    if (!session) {
      window.location.href = "/login?next=/pricing";
      return;
    }
    setStripeBusyId(tierId);
    setUpgradeError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
      else if (session.userId) headers["X-User-Id"] = session.userId;
      const res = await fetch("/api/stripe/create-membership-session", {
        method: "POST",
        headers,
        body: JSON.stringify({ tier: tierId }),
      });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
      else setUpgradeError(data?.error ?? "Checkout could not start.");
    } catch {
      setUpgradeError("Network error. Try again.");
    } finally {
      setStripeBusyId(null);
    }
  }

  async function confirmPayWithBalance() {
    if (!confirmTier) return;
    const session = await getSessionAsync();
    if (!session?.accessToken) {
      setUpgradeError("Please sign in again to use your balance.");
      return;
    }
    setUpgradeBusy(true);
    setUpgradeError(null);
    try {
      const res = await fetch("/api/membership/upgrade-with-balance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ tier: confirmTier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUpgradeError((data as { error?: string }).error ?? "Upgrade failed.");
        return;
      }
      const label = MARKETING_PLANS[confirmTier].label;
      const gpcBonus = typeof (data as { gpcBonus?: number }).gpcBonus === "number" ? (data as { gpcBonus: number }).gpcBonus : 0;
      setSuccessMsg(
        gpcBonus > 0
          ? `You're now a ${label} member! 🎉 You received ${gpcBonus.toLocaleString()} GPC upgrade bonus!`
          : `You're now a ${label} member! 🎉`
      );
      setConfirmTier(null);
      setBalanceCents(typeof data.newBalance === "number" ? data.newBalance : null);
      setMembershipTierUi(normalizeUserMembershipTier(confirmTier));
      const s2 = await getSessionAsync();
      if (s2?.accessToken) {
        const er = await fetch("/api/membership/balance-eligibility", {
          headers: { Authorization: `Bearer ${s2.accessToken}` },
          cache: "no-store",
        });
        const elig = await er.json().catch(() => ({}));
        if (er.ok && typeof (elig as { eligibleBalance?: number }).eligibleBalance === "number") {
          const e = elig as {
            totalBalance?: number;
            eligibleBalance?: number;
            heldBalance?: number;
            heldUntil?: string | null;
          };
          setBalanceInfo({
            totalBalance: e.totalBalance ?? 0,
            eligibleBalance: e.eligibleBalance ?? 0,
            heldBalance: e.heldBalance ?? 0,
            heldUntil: e.heldUntil ?? null,
          });
        }
      }
    } catch {
      setUpgradeError("Network error. Try again.");
    } finally {
      setUpgradeBusy(false);
    }
  }

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
          <div className="mx-auto mt-6 max-w-xl rounded-xl border border-violet-500/35 bg-violet-950/40 px-4 py-3 text-sm text-violet-100/95">
            <span className="font-semibold text-white">Gold Coins &amp; GPay Coins</span> are separate from membership —{" "}
            <Link href="/dashboard/buy-coins" className="text-[#fde047] font-medium underline-offset-2 hover:underline">
              shop coin packs
            </Link>{" "}
            for games and bonuses.
          </div>
          <p className="mt-2 text-xs text-violet-400/80">
            {loading
              ? "Loading plans from Supabase…"
              : source === "supabase"
                ? "Plans synced from Supabase `membership_plan_catalog` (Free always first)."
                : "Showing embedded membership defaults — apply Supabase `membership_plan_catalog` migrations and ensure `/api/membership-plans` is reachable."}
          </p>
          {successMsg && (
            <p className="mx-auto mt-4 max-w-lg rounded-xl border border-[#eab308]/50 bg-[#eab308]/15 px-4 py-3 text-sm font-medium text-[#fde047]">
              {successMsg}
            </p>
          )}
          {upgradeError && (
            <p className="mx-auto mt-2 max-w-lg text-sm text-red-400">{upgradeError}</p>
          )}
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
                  {chrome.badge ? (
                    <div
                      className={`absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                        chrome.badge === "MOST POPULAR"
                          ? "bg-[#eab308] text-[#0c0618] shadow-lg"
                          : "bg-gradient-to-r from-violet-600 to-violet-500 text-white"
                      }`}
                    >
                      {chrome.badge}
                    </div>
                  ) : null}
                  <h2 className="text-xl font-bold text-white">{p.name}</h2>
                  <div className="mt-8 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-[#fde047]">{priceLabel}</span>
                    <span className="text-sm text-violet-300/80">{period}</span>
                  </div>
                  {(() => {
                    const monthlyGpc = getMonthlyGpcBonusForPlan(p.id);
                    return (
                      <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-3 py-2.5 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/95">
                          Monthly GPay Coins bonus
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums text-emerald-300">
                          {monthlyGpc === 0 ? "—" : `+${monthlyGpc.toLocaleString()} GPC`}
                        </p>
                        {monthlyGpc > 0 ? (
                          <p className="mt-0.5 text-[10px] text-violet-300/75">Included each billing month</p>
                        ) : (
                          <p className="mt-0.5 text-[10px] text-violet-400/60">Upgrade for monthly GPC</p>
                        )}
                      </div>
                    );
                  })()}
                  <ul className="mt-6 flex-1 space-y-3 text-sm text-violet-100/90">
                    {feats.map((f) => (
                      <li key={f} className="flex items-start">
                        {CHECK}
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8 flex flex-col gap-2">
                    {p.id === "free" ? (
                      <Link
                        href="/register"
                        className="block w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-violet-400 sm:text-base"
                      >
                        <span className="hidden sm:inline">Start Earning Free — No Credit Card Needed</span>
                        <span className="sm:hidden">Start Earning Free</span>
                      </Link>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={stripeBusyId === p.id}
                          onClick={() => subscribeWithCard(p.id)}
                          className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-violet-400 disabled:opacity-60 sm:text-base"
                        >
                          {stripeBusyId === p.id ? "Redirecting…" : "Subscribe with card"}
                        </button>
                        {dashLoading && balanceCents == null ? (
                          <p className="text-center text-xs text-violet-500">Loading balance…</p>
                        ) : balanceCents != null && !dashLoading && isPaidTierId(p.id) ? (
                          (() => {
                            const rankCurrent = membershipTierRank(membershipTierUi);
                            const rankCard = membershipTierRank(p.id as MarketingPlanId);
                            if (rankCard < rankCurrent) {
                              return (
                                <p className="text-center text-xs text-violet-500">Lower than your current plan</p>
                              );
                            }
                            if (rankCard === rankCurrent) {
                              return (
                                <p className="text-center text-xs font-medium text-emerald-400/90">Your current plan</p>
                              );
                            }
                            const priceC = PAID_TIER_PRICES_CENTS[p.id];
                            const eligible = balanceInfo.eligibleBalance;
                            const canAffordWithBalance = eligible >= priceC;
                            const short = Math.max(0, priceC - eligible);
                            return (
                              <div className="flex flex-col gap-1">
                                {canAffordWithBalance ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUpgradeError(null);
                                      if (isPaidTierId(p.id)) setConfirmTier(p.id);
                                    }}
                                    className="w-full rounded-xl border border-[#eab308]/60 bg-gradient-to-r from-[#a16207] via-[#eab308] to-[#fde047] py-3 text-center text-sm font-semibold text-[#0c0618] shadow-md shadow-[#eab308]/20 transition hover:opacity-95 sm:text-base"
                                  >
                                    Pay with Balance ({formatUsdFromCents(eligible)} eligible)
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      disabled
                                      className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-[#1a1a1a] py-3 text-center text-sm font-semibold text-violet-500/90 sm:text-base"
                                    >
                                      Pay with Balance ({formatUsdFromCents(eligible)} eligible)
                                    </button>
                                    {balanceInfo.heldBalance > 0 ? (
                                      <p className="text-center text-[11px] leading-snug text-violet-400/90">
                                        {formatUsdFromCents(balanceInfo.heldBalance)} on 7-day security hold from recent
                                        deposit.
                                        {balanceInfo.heldUntil ? (
                                          <>
                                            {" "}
                                            Full eligible access from{" "}
                                            {new Date(balanceInfo.heldUntil).toLocaleDateString()}.
                                          </>
                                        ) : null}
                                      </p>
                                    ) : (
                                      <p className="text-center text-xs text-violet-400/90">
                                        Need {formatUsdFromCents(short)} more eligible balance.{" "}
                                        <Link href="/wallet" className="text-[#eab308] underline-offset-2 hover:underline">
                                          Add funds
                                        </Link>
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })()
                        ) : p.id !== "free" ? (
                          <p className="text-center text-xs text-violet-500">
                            <Link href="/login?next=/pricing" className="text-[#eab308] hover:underline">
                              Sign in
                            </Link>{" "}
                            to pay with balance.
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
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

        <section className="mt-16 rounded-2xl border border-white/10 bg-[#0c0618]/80 px-6 py-6 md:px-8 md:py-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Advertising your business</h2>
              <p className="mt-1 text-sm text-violet-200/80">
                Separate from membership: view + click campaign packages, managed in admin and shown on{" "}
                <Link href="/advertise" className="text-[#eab308] hover:underline">
                  /advertise
                </Link>
                .
              </p>
            </div>
            <Link
              href="/advertise"
              className="shrink-0 rounded-xl border border-[#eab308]/50 bg-[#eab308]/15 px-5 py-2.5 text-center text-sm font-semibold text-[#fde047] hover:bg-[#eab308]/25"
            >
              View ad packages
            </Link>
          </div>
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

      {confirmTier && !dashLoading && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upgrade-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0c0618] p-6 shadow-xl">
            <h2 id="upgrade-modal-title" className="text-lg font-bold text-white">
              Upgrade to {MARKETING_PLANS[confirmTier].label}
            </h2>
            {(() => {
              const priceC = PAID_TIER_PRICES_CENTS[confirmTier];
              const total =
                balanceInfo.totalBalance > 0 ? balanceInfo.totalBalance : (balanceCents ?? 0);
              const after = total - priceC;
              return (
                <div className="mt-4 space-y-2 text-sm text-violet-200/90">
                  <p>
                    Amount: <span className="text-white">{formatUsdFromCents(priceC)}</span>
                  </p>
                  <p>
                    Your balance: <span className="text-white">{formatUsdFromCents(total)}</span>
                  </p>
                  {balanceInfo.heldBalance > 0 ? (
                    <p className="text-xs text-violet-400/90">
                      Eligible for membership: {formatUsdFromCents(balanceInfo.eligibleBalance)} (
                      {formatUsdFromCents(balanceInfo.heldBalance)} on deposit hold)
                    </p>
                  ) : null}
                  <p>
                    Balance after: <span className="text-[#fde047]">{formatUsdFromCents(Math.max(0, after))}</span>
                  </p>
                  <p className="pt-3 text-violet-300/90">
                    Your membership renews in 30 days. You can cancel anytime.
                  </p>
                </div>
              );
            })()}
            {upgradeError && <p className="mt-3 text-sm text-red-400">{upgradeError}</p>}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { setConfirmTier(null); setUpgradeError(null); }}
                className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium text-violet-200 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={upgradeBusy}
                onClick={() => void confirmPayWithBalance()}
                className="rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
              >
                {upgradeBusy ? "Processing…" : "Confirm upgrade"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
