"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getSessionAsync, type ClientSession } from "@/lib/session";
import { generateReferralLink } from "@/lib/referrals";
import {
  getDashboard,
  getGpayBalance,
  getWithdrawals,
  getGrowth,
  getActivities,
  claimDailyReward,
  ensureReferralBonus,
  convertToAdCredit,
} from "@/lib/api";
import { SupabaseEarningsTracker } from "@/components/dashboard/SupabaseEarningsTracker";
import { MARKETING_PLANS, normalizeUserMembershipTier, type MarketingPlanId } from "@/lib/garmon-plan-config";
import { MembershipPlanPicker } from "@/components/dashboard/MembershipPlanPicker";
import { MAX_PAYMENT_CENTS, MIN_WALLET_FUND_CENTS } from "@/lib/security";
import { PAID_TIER_PRICES_CENTS, isPaidTierId } from "@/lib/membership-balance-prices";
import { createBrowserClient } from "@/lib/supabase";
import { resolveProfileBalanceCents } from "@/lib/profile-balance";
import { TaxInfoBanner } from "@/components/dashboard/TaxInfoBanner";
import { IRS_REPORTABLE_PAYOUT_THRESHOLD_CENTS } from "@/lib/signup-compliance";

const AdDisplay = dynamic(() => import("@/components/AdDisplay").then((m) => ({ default: m.AdDisplay })), { ssr: false });

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** GPay minor units: 100 minor = 1.00 display GP (consistent 2 decimal places; not USD). */
function formatGpayMinor(minor: number): string {
  const n = Number(minor);
  if (!Number.isFinite(n)) return "0.00";
  return (n / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type GpayBalanceState = {
  gpayAvailableBalanceMinor: number;
  gpayPendingClaimBalanceMinor: number;
  gpayClaimedBalanceMinor: number;
  gpayLifetimeEarnedMinor: number;
};

const GPAY_ZERO: GpayBalanceState = {
  gpayAvailableBalanceMinor: 0,
  gpayPendingClaimBalanceMinor: 0,
  gpayClaimedBalanceMinor: 0,
  gpayLifetimeEarnedMinor: 0,
};

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [withdrawals, setWithdrawals] = useState<{ id: string; amount: number; status: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [convertModal, setConvertModal] = useState(false);
  const [convertAmount, setConvertAmount] = useState("");
  const [convertSubmitting, setConvertSubmitting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [growth, setGrowth] = useState<{
    totalReferrals: number;
    leaderboardRank: number | null;
    badges: Array<{ code: string; name: string; icon: string }>;
    canClaimDaily: boolean;
  } | null>(null);
  const [activities, setActivities] = useState<Array<{ id: string; email: string; activityType: string; description: string; amountCents: number | null; createdAt: string }>>([]);
  const [dailyClaiming, setDailyClaiming] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [stripeStatusMessage, setStripeStatusMessage] = useState<string | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewBusy, setRenewBusy] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);
  /** Client read of `profiles` — source of truth; overrides API when set. */
  const [profileBalanceCents, setProfileBalanceCents] = useState<number | null>(null);
  const [profileBalanceError, setProfileBalanceError] = useState<string | null>(null);
  const [gpayBalance, setGpayBalance] = useState<GpayBalanceState>({ ...GPAY_ZERO });

  const fetchGpayBalance = useCallback(async (accessToken?: string | null) => {
    const token =
      accessToken ??
      (await getSessionAsync().then((s) => s?.accessToken ?? null));
    if (!token) {
      setGpayBalance({ ...GPAY_ZERO });
      return;
    }
    try {
      const b = await getGpayBalance(token);
      setGpayBalance({
        gpayAvailableBalanceMinor: Math.trunc(Number(b.gpayAvailableBalanceMinor)) || 0,
        gpayPendingClaimBalanceMinor: Math.trunc(Number(b.gpayPendingClaimBalanceMinor)) || 0,
        gpayClaimedBalanceMinor: Math.trunc(Number(b.gpayClaimedBalanceMinor)) || 0,
        gpayLifetimeEarnedMinor: Math.trunc(Number(b.gpayLifetimeEarnedMinor)) || 0,
      });
    } catch {
      setGpayBalance({ ...GPAY_ZERO });
    }
  }, []);

  const fetchProfileBalanceFromSupabase = useCallback(async () => {
    const supabase = createBrowserClient();
    if (!supabase) {
      console.warn("[dashboard] Supabase browser client not configured");
      return;
    }
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    console.log("AUTH USER:", user);
    if (userErr || !user) {
      console.log("PROFILE:", null, userErr);
      setProfileBalanceError(userErr?.message ?? "Not authenticated");
      setProfileBalanceCents(null);
      return;
    }
    let row: { balance?: unknown; balance_cents?: unknown } | null = null;
    let qErr: { message?: string } | null | undefined;
    {
      const r1 = await supabase.from("profiles").select("balance, balance_cents").eq("id", user.id).maybeSingle();
      const missingCol =
        r1.error &&
        (/balance_cents|column .* does not exist/i.test(r1.error.message ?? "") ||
          (r1.error as { code?: string }).code === "42703");
      if (missingCol) {
        const r2 = await supabase.from("profiles").select("balance").eq("id", user.id).maybeSingle();
        row = r2.data;
        qErr = r2.error;
      } else {
        row = r1.data;
        qErr = r1.error;
      }
    }
    console.log("PROFILE:", row, qErr);
    if (qErr) {
      setProfileBalanceError(qErr.message ?? "Profile query failed");
      setProfileBalanceCents(null);
      return;
    }
    const resolved = resolveProfileBalanceCents(row);
    if (!resolved.ok) {
      setProfileBalanceError(resolved.message);
      setProfileBalanceCents(null);
      return;
    }
    const displayBalance = resolved.cents / 100;
    console.log("BALANCE USED:", displayBalance);
    setProfileBalanceError(null);
    setProfileBalanceCents(resolved.cents);
  }, []);

  useEffect(() => {
    if (!depositModalOpen) return;
    fetch("/api/stripe/status").then((r) => r.json()).then((d) => {
      if (!d?.ok && d?.message) setStripeStatusMessage(d.message);
      else setStripeStatusMessage(null);
    }).catch(() => setStripeStatusMessage(null));
  }, [depositModalOpen]);

  // Main balance: GET /api/dashboard `balanceCents` (canonical wallet_balances). Client profile fetch is fallback only.
  const refetchParam = searchParams.get("refetch");
  useEffect(() => {
    if (refetchParam !== "1") return;
    const t = setTimeout(() => {
      getSessionAsync().then((session) => {
        if (session) {
          const tokenOrId = session.accessToken ?? session.userId;
          const isToken = !!session.accessToken;
          getDashboard(tokenOrId, isToken).then(setData);
          void fetchProfileBalanceFromSupabase();
          void fetchGpayBalance(session.accessToken ?? null);
        }
      });
    }, 2500);
    return () => clearTimeout(t);
  }, [refetchParam, fetchProfileBalanceFromSupabase, fetchGpayBalance]);

  function loadDashboardData(tokenOrId: string, isToken: boolean) {
    Promise.all([
      getDashboard(tokenOrId, isToken),
      getWithdrawals(tokenOrId, isToken).catch(() => ({ withdrawals: [] as { id: string; amount: number; status: string; created_at: string }[], minWithdrawalCents: 100 })),
      getGrowth(tokenOrId, isToken).catch(() => null),
      getActivities(tokenOrId, isToken).catch(() => ({ activities: [] })),
    ]).then(([dash, w, g, a]) => {
      setData(dash);
      setWithdrawals(w.withdrawals ?? []);
      setGrowth(g ? { totalReferrals: g.totalReferrals, leaderboardRank: g.leaderboardRank, badges: g.badges, canClaimDaily: g.canClaimDaily } : null);
      setActivities("activities" in a ? a.activities : []);
      void fetchProfileBalanceFromSupabase();
      if (isToken) void fetchGpayBalance(tokenOrId);
      else void fetchGpayBalance(null);
    });
  }

  useEffect(() => {
    let cancelled = false;
    getSessionAsync()
      .then((session) => {
        if (cancelled) return;
        if (!session) {
          router.replace("/login?next=/dashboard");
          return;
        }
        const tokenOrId = session.accessToken ?? session.userId;
        const isToken = !!session.accessToken;
        ensureReferralBonus(tokenOrId, isToken).catch(() => {});
        return Promise.allSettled([
          getDashboard(tokenOrId, isToken),
          getWithdrawals(tokenOrId, isToken),
          getGrowth(tokenOrId, isToken),
          getActivities(tokenOrId, isToken),
        ]).then(([dashRes, wRes, gRes, aRes]) => {
          if (cancelled) return;
          if (dashRes.status === "fulfilled" && dashRes.value != null) {
            setData(dashRes.value);
            setError(null);
          } else {
            setError("Dashboard data could not be loaded. Try again.");
            setData(null);
          }
          if (wRes.status === "fulfilled") {
            setWithdrawals(wRes.value?.withdrawals ?? []);
          }
          if (gRes.status === "fulfilled" && gRes.value) {
            const g = gRes.value;
            setGrowth({ totalReferrals: g.totalReferrals, leaderboardRank: g.leaderboardRank, badges: g.badges, canClaimDaily: g.canClaimDaily });
          }
          if (aRes.status === "fulfilled" && aRes.value && typeof aRes.value === "object" && "activities" in aRes.value) {
            setActivities((aRes.value as { activities?: typeof activities }).activities ?? []);
          }
          if (session.accessToken) void fetchGpayBalance(session.accessToken);
          else void fetchGpayBalance(null);
        });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Dashboard load error", err);
          setError("Unable to load dashboard. Check your connection or try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [router, fetchGpayBalance]);

  useEffect(() => {
    void fetchProfileBalanceFromSupabase();
  }, [fetchProfileBalanceFromSupabase]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void fetchProfileBalanceFromSupabase();
        void fetchGpayBalance();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchProfileBalanceFromSupabase, fetchGpayBalance]);

  const [session, setSessionState] = useState<ClientSession | null | "pending">("pending");
  useEffect(() => {
    getSessionAsync().then(setSessionState);
  }, []);
  useEffect(() => {
    if (session !== "pending") return;
    const t = setTimeout(() => setSessionState(null), 3000);
    return () => clearTimeout(t);
  }, [session]);

  const loadingStyle: React.CSSProperties = { color: "#9CA3AF", minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" };
  if (session === "pending") {
    return <div className="flex min-h-[60vh] items-center justify-center text-fintech-muted" style={loadingStyle}>Loading…</div>;
  }
  if (session === null) {
    return <div className="flex min-h-[60vh] items-center justify-center text-fintech-muted" style={loadingStyle}>Redirecting to login…</div>;
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-fintech-muted" style={loadingStyle}>Loading dashboard…</div>;
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
        <div className="card-lux max-w-md p-6 text-center">
          <p className="mb-4 text-fintech-danger">{error ?? "Failed to load dashboard"}</p>
          <button
            type="button"
            onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
            className="btn-press min-h-touch rounded-xl bg-fintech-accent px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const apiBalanceErr = (data as { balanceError?: string | null } | null)?.balanceError ?? null;
  const balanceCents =
    data?.balanceCents != null
      ? data.balanceCents
      : profileBalanceCents !== null
        ? profileBalanceCents
        : null;
  const balanceDisplayError =
    balanceCents === null
      ? (profileBalanceError ?? apiBalanceErr ?? "Balance unavailable")
      : null;
  const adCreditBalanceCents = (data as { adCreditBalanceCents?: number }).adCreditBalanceCents ?? 0;
  const totalEarningsCents = (data as { totalEarningsCents?: number }).totalEarningsCents ?? 0;
  const totalWithdrawnCents = (data as { totalWithdrawnCents?: number }).totalWithdrawnCents ?? 0;

  async function handleDailyClaim() {
    const s = await getSessionAsync();
    if (!s) return;
    setDailyClaiming(true);
    try {
      await claimDailyReward(s.accessToken ?? s.userId, !!s.accessToken);
      loadDashboardData(s.accessToken ?? s.userId, !!s.accessToken);
    } finally {
      setDailyClaiming(false);
    }
  }

  async function handleConvertToAdCredit(e: React.FormEvent) {
    e.preventDefault();
    const session = await getSessionAsync();
    if (!session || !convertAmount.trim()) return;
    const amountCents = Math.round(parseFloat(convertAmount) * 100);
    if (
      balanceCents == null ||
      !Number.isFinite(amountCents) ||
      amountCents <= 0 ||
      amountCents > balanceCents
    ) {
      setConvertError("Enter a valid amount not exceeding your balance");
      return;
    }
    setConvertError(null);
    setConvertSubmitting(true);
    try {
      await convertToAdCredit(session.accessToken ?? session.userId, !!session.accessToken, amountCents);
      setConvertModal(false);
      setConvertAmount("");
      const dash = await getDashboard(session.accessToken ?? session.userId, !!session.accessToken);
      setData(dash);
      await fetchProfileBalanceFromSupabase();
      await fetchGpayBalance(session.accessToken ?? null);
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setConvertSubmitting(false);
    }
  }

  const upgrade = async (tier: MarketingPlanId) => {
    if (tier === "free") return;
    const session = await getSessionAsync();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
    else if (session?.userId) headers["X-User-Id"] = session.userId;
    const res = await fetch("/api/stripe/create-membership-session", {
      method: "POST",
      headers,
      body: JSON.stringify({ tier }),
    });
    const data = await res.json();
    if (data?.url) window.location.href = data.url;
    else if (data?.error) setCheckoutError(data.error);
  };

  const addFunds = async (amount: number) => {
    const session = await getSessionAsync();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
    if (session?.userId) headers["X-User-Id"] = session.userId;
    try {
      const res = await fetch("/api/stripe/add-funds", {
        method: "POST",
        headers,
        body: JSON.stringify({ amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setCheckoutError(data?.error || (res.status === 401 ? "Please sign in to deposit." : "Deposit unavailable. Try again."));
    } catch {
      setCheckoutError("Network error. Please try again.");
    }
  };

  const handleDeposit = async () => {
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount < 5 || amount > 1000) {
      setCheckoutError("Enter an amount between $5 and $1,000.");
      return;
    }
    setCheckoutError(null);
    setDepositLoading(true);
    try {
      await addFunds(amount);
    } finally {
      setDepositLoading(false);
    }
  };

  const planForUi = normalizeUserMembershipTier(data.membershipTier);
  const tierDbRaw = (data as { membershipTierDb?: string }).membershipTierDb ?? "";
  const membershipExpiresAt = (data as { membershipExpiresAt?: string | null }).membershipExpiresAt ?? null;
  const membershipPaymentSource = (data as { membershipPaymentSource?: string | null }).membershipPaymentSource ?? null;
  const stripeSubscriptionId = (data as { stripeSubscriptionId?: string | null }).stripeSubscriptionId ?? null;
  const expDate = membershipExpiresAt ? new Date(membershipExpiresAt) : null;
  const expValid = expDate && !Number.isNaN(expDate.getTime());
  const daysUntilExpiry =
    expValid && expDate
      ? Math.ceil((expDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;
  const paidViaStripe = membershipPaymentSource === "stripe" || (!!stripeSubscriptionId && membershipPaymentSource !== "balance");
  const renewalPriceCents =
    isPaidTierId(planForUi) ? PAID_TIER_PRICES_CENTS[planForUi] : 0;
  const shortfallCents =
    balanceCents == null ? 0 : Math.max(0, renewalPriceCents - balanceCents);
  const showExpiryWarning =
    membershipPaymentSource === "balance" &&
    planForUi !== "free" &&
    daysUntilExpiry != null &&
    daysUntilExpiry >= 0 &&
    daysUntilExpiry <= 7;

  async function renewWithBalance() {
    const session = await getSessionAsync();
    if (!session?.accessToken || !isPaidTierId(planForUi)) return;
    setRenewBusy(true);
    setRenewError(null);
    try {
      const res = await fetch("/api/membership/upgrade-with-balance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ tier: planForUi, renew: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRenewError((json as { error?: string }).error ?? "Renewal failed.");
        return;
      }
      setRenewOpen(false);
      const dash = await getDashboard(session.accessToken ?? session.userId, !!session.accessToken);
      setData(dash);
      await fetchProfileBalanceFromSupabase();
      await fetchGpayBalance(session.accessToken ?? null);
    } catch {
      setRenewError("Network error.");
    } finally {
      setRenewBusy(false);
    }
  }

  return (
    <div className="space-y-5 tablet:space-y-6">
      <TaxInfoBanner
        visible={Boolean(data.taxInfoRequired)}
        reportableEarningsCents={data.reportableEarningsCents ?? 0}
        thresholdCents={data.irsReportableThresholdCents ?? IRS_REPORTABLE_PAYOUT_THRESHOLD_CENTS}
        onCertified={() => {
          const tokenOrId = session.accessToken ?? session.userId;
          loadDashboardData(tokenOrId, !!session.accessToken);
        }}
      />
      <SupabaseEarningsTracker
        userId={session.userId}
        membershipTier={planForUi}
        commissionTier={tierDbRaw || undefined}
        dashboardReferrals={{
          totalReferrals: data.totalReferrals ?? 0,
          activeReferralSubscriptions: data.activeReferralSubscriptions ?? 0,
          referralEarningsCents: data.referralEarningsCents ?? 0,
        }}
      />

      {(planForUi !== "free" || membershipExpiresAt || paidViaStripe) && (
        <section className="animate-slide-up card-lux p-5 tablet:p-6">
          <h2 className="text-lg font-bold text-white">Membership status</h2>
          <p className="mt-1 text-sm text-fintech-muted">
            Current tier:{" "}
            <span className="font-semibold text-white">{MARKETING_PLANS[planForUi].label}</span>
          </p>
          <p className="mt-2 text-sm text-fintech-muted">
            {paidViaStripe && !expValid ? (
              <>Billing: Paid via Stripe</>
            ) : expValid && expDate ? (
              <>
                Expires:{" "}
                <span className="text-white">
                  {expDate.toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                {paidViaStripe ? (
                  <span className="text-fintech-muted"> (Stripe subscription)</span>
                ) : null}
              </>
            ) : (
              <span className="text-fintech-muted">Renewal date will appear after your next balance upgrade.</span>
            )}
          </p>
          {showExpiryWarning && (
            <p className="mt-3 text-sm font-medium text-red-400">
              Expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? "" : "s"} — Renew now
            </p>
          )}
          {membershipPaymentSource === "balance" && planForUi !== "free" && shortfallCents > 0 && showExpiryWarning && (
            <p className="mt-2 text-sm text-amber-200/90">
              Add {formatCents(shortfallCents)} to auto-renew at your current tier.
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2 tablet:flex-row">
            {membershipPaymentSource === "balance" && planForUi !== "free" && showExpiryWarning && (
              <button
                type="button"
                onClick={() => { setRenewError(null); setRenewOpen(true); }}
                className="btn-press min-h-touch rounded-xl bg-fintech-accent px-5 py-3 font-semibold text-white hover:opacity-90"
              >
                Renew with balance
              </button>
            )}
            {paidViaStripe && (
              <Link
                href="/pricing"
                className="btn-press min-h-touch flex flex-1 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-3 font-medium text-white hover:bg-white/10"
              >
                Update payment method
              </Link>
            )}
          </div>
        </section>
      )}

      {renewOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="card-lux max-w-md p-6">
            <h3 className="text-lg font-bold text-white">Renew {MARKETING_PLANS[planForUi].label}</h3>
            <p className="mt-2 text-sm text-fintech-muted">
              {formatCents(renewalPriceCents)} will be deducted from your balance. Your term extends by 30 days from your
              current expiry.
            </p>
            {renewError && <p className="mt-2 text-sm text-red-400">{renewError}</p>}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRenewOpen(false)}
                className="rounded-xl border border-white/20 px-4 py-2.5 text-sm text-white hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={renewBusy}
                onClick={() => void renewWithBalance()}
                className="rounded-xl bg-fintech-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {renewBusy ? "Processing…" : "Confirm renewal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ——— Wallet-style Balance Card ——— */}
      <section className="animate-slide-up card-lux overflow-hidden p-6 tablet:p-8">
        <p className="text-sm font-medium text-fintech-muted">Available Balance</p>
        {balanceDisplayError ? (
          <p className="mt-1 text-lg font-semibold text-red-400 tablet:text-xl">{balanceDisplayError}</p>
        ) : (
          <p className="mt-1 text-4xl font-bold tracking-tight text-white tablet:text-5xl">
            {balanceCents != null ? formatCents(balanceCents) : "—"}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 tablet:flex-row tablet:gap-4">
          <button
            type="button"
            onClick={() => { setDepositModalOpen(true); setCheckoutError(null); setDepositAmount(""); }}
            className="btn-press min-h-touch flex flex-1 items-center justify-center rounded-xl bg-fintech-accent px-5 py-3 font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Deposit
          </button>
          <Link
            href="/dashboard/withdraw"
            className="btn-press min-h-touch flex flex-1 items-center justify-center rounded-xl bg-fintech-accent px-5 py-3 font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
          >
            Withdraw
          </Link>
          <button
            type="button"
            onClick={() => setConvertModal(true)}
            className="btn-press min-h-touch flex flex-1 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-3 font-medium text-white transition-all hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
            disabled={balanceCents == null || balanceCents < 100}
          >
            Transfer
          </button>
        </div>
      </section>

      {/* ——— GPay Balance (internal rewards; not USD) ——— */}
      <section
        className="animate-slide-up card-lux overflow-hidden border border-emerald-500/30 bg-emerald-950/25 p-6 tablet:p-8"
        aria-label="GPay Balance"
      >
        <h2 className="text-lg font-bold text-emerald-100">GPay Balance</h2>
        <p className="mt-1 text-xs leading-relaxed text-fintech-muted">
          Internal rewards — not US dollars. Separate from Available Balance above.
        </p>
        <p className="mt-5 text-sm font-medium text-emerald-200/80">Available GPay Balance</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-emerald-50 tablet:text-4xl">
          {formatGpayMinor(gpayBalance.gpayAvailableBalanceMinor)}{" "}
          <span className="text-lg font-semibold text-emerald-300/90">GP</span>
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-emerald-500/20 pt-5 tablet:grid-cols-3 tablet:gap-6">
          <div>
            <p className="text-xs font-medium text-fintech-muted">Pending Claims</p>
            <p className="mt-1 font-mono text-lg font-semibold text-emerald-100/95">
              {formatGpayMinor(gpayBalance.gpayPendingClaimBalanceMinor)} GP
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-fintech-muted">Total Claimed</p>
            <p className="mt-1 font-mono text-lg font-semibold text-emerald-100/95">
              {formatGpayMinor(gpayBalance.gpayClaimedBalanceMinor)} GP
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-fintech-muted">Lifetime Earned</p>
            <p className="mt-1 font-mono text-lg font-semibold text-emerald-100/95">
              {formatGpayMinor(gpayBalance.gpayLifetimeEarnedMinor)} GP
            </p>
          </div>
        </div>
        <div className="mt-6">
          <button
            type="button"
            disabled
            className="btn-press min-h-touch w-full cursor-not-allowed rounded-xl border border-emerald-500/40 bg-emerald-900/40 px-5 py-3 text-sm font-semibold text-emerald-200/70 opacity-80 tablet:max-w-xs"
            title="Coming soon"
          >
            Claim GPay
          </button>
        </div>
      </section>

      {/* ——— Quick actions ——— */}
      <section className="animate-slide-up card-lux p-5 tablet:p-6">
        <h2 className="text-lg font-bold text-white">Quick actions</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 tablet:grid-cols-2 tablet:gap-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => router.push("/dashboard/earn/calculator")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push("/dashboard/earn/calculator");
              }
            }}
            style={{
              background: "linear-gradient(135deg, #1a1200, #2a1800)",
              border: "1px solid #f0a500",
              borderRadius: 12,
              padding: 16,
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 28 }}>💰</div>
            <div
              style={{
                color: "#f0a500",
                fontWeight: 700,
                fontSize: 14,
                marginTop: 8,
              }}
            >
              Income Calculator
            </div>
            <div style={{ color: "#666", fontSize: 12 }}>See your earning potential</div>
          </div>
        </div>
      </section>

      {/* ——— Upgrade Membership & Add Funds ——— */}
      <section className="animate-slide-up card-lux p-5 tablet:p-6" style={{ marginTop: "30px" }}>
        {checkoutError && (
          <p className="mb-3 text-sm text-red-400">
            {checkoutError}
            <button type="button" onClick={() => setCheckoutError(null)} className="ml-2 underline">Dismiss</button>
          </p>
        )}
        <h2 className="text-lg font-bold text-white">Membership</h2>
        <p className="mt-1 text-sm text-fintech-muted">
          <span className="text-white/90">Your plan: {MARKETING_PLANS[planForUi].label}.</span> Free members pay $0; paid tiers match{" "}
          <Link href="/pricing" className="text-fintech-accent underline-offset-2 hover:underline">
            Pricing
          </Link>{" "}
          and bill monthly via Stripe.
        </p>
        <div className="mt-4">
          <MembershipPlanPicker currentTier={planForUi} onUpgradePaid={upgrade} />
        </div>
        <h2 className="mt-8 text-lg font-bold text-white" style={{ marginTop: "30px" }}>Wallet</h2>
        <p className="mt-1 text-sm text-fintech-muted">
          {`Click Deposit above to add funds ($${MIN_WALLET_FUND_CENTS / 100}–$${(MAX_PAYMENT_CENTS / 100).toLocaleString()} per transaction).`}
        </p>
      </section>

      {/* ——— Deposit modal ——— */}
      {depositModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !depositLoading && setDepositModalOpen(false)}
        >
          <div
            className="card-lux w-full max-w-sm p-6 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white">Deposit</h3>
            <p className="mt-1 text-sm text-fintech-muted">
              {`Enter amount between $${MIN_WALLET_FUND_CENTS / 100} and $${(MAX_PAYMENT_CENTS / 100).toLocaleString()}.`}
            </p>
            {checkoutError && (
              <p className="mt-2 text-sm text-red-400">
                {checkoutError}
                <button type="button" onClick={() => setCheckoutError(null)} className="ml-2 underline hover:no-underline">Retry</button>
              </p>
            )}
            {stripeStatusMessage && (
              <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                <p className="font-medium">Stripe key issue</p>
                <ol className="mt-2 list-decimal list-inside space-y-1 text-xs">
                  <li>Stripe Dashboard → Developers → API keys → copy Secret key (sk_...)</li>
                  <li>In .env.local set STRIPE_SECRET_KEY=sk_...</li>
                  <li>Restart: run npm run dev</li>
                </ol>
                <button type="button" onClick={() => setStripeStatusMessage(null)} className="mt-2 underline">Dismiss</button>
              </div>
            )}
            <input
              type="number"
              id="depositAmount"
              min={MIN_WALLET_FUND_CENTS / 100}
              max={MAX_PAYMENT_CENTS / 100}
              step="0.01"
              placeholder="Enter amount"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="mt-4 w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3 text-white placeholder:text-fintech-muted focus:border-fintech-accent focus:outline-none"
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setDepositModalOpen(false)}
                disabled={depositLoading}
                className="btn-press min-h-touch flex-1 rounded-xl border border-white/20 py-3 text-white hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeposit}
                disabled={depositLoading}
                className="btn-press min-h-touch flex-1 rounded-xl bg-fintech-accent py-3 font-semibold text-white hover:opacity-90 disabled:opacity-70"
              >
                {depositLoading ? "Redirecting…" : "Deposit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ——— Earnings, Referral, Ad cards ——— */}
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3 tablet:gap-5">
        <section className="animate-slide-up card-lux p-5 tablet:p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-fintech-muted">Earnings</p>
          <p className="mt-2 text-2xl font-bold text-white tablet:text-3xl">{formatCents(data.earningsTodayCents)}</p>
          <p className="mt-1 text-sm text-fintech-muted">Today</p>
          <div className="mt-4 flex gap-4 border-t border-white/[0.06] pt-4">
            <div>
              <p className="text-lg font-semibold text-white">{formatCents(data.earningsWeekCents)}</p>
              <p className="text-xs text-fintech-muted">This week</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{formatCents(data.earningsMonthCents)}</p>
              <p className="text-xs text-fintech-muted">This month</p>
            </div>
          </div>
          <Link href="/dashboard/earnings" className="mt-4 inline-block text-sm font-medium text-fintech-accent hover:underline">
            View details →
          </Link>
        </section>

        <section className="animate-slide-up card-lux p-5 tablet:p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-fintech-muted">Referral Earnings</p>
          <p className="mt-2 text-2xl font-bold text-fintech-success tablet:text-3xl">{formatCents(data.referralEarningsCents ?? 0)}</p>
          <p className="mt-1 text-sm text-fintech-muted">{data.totalReferrals ?? 0} referrals</p>
          <Link href="/dashboard/referrals" className="mt-4 inline-block text-sm font-medium text-fintech-accent hover:underline">
            Referral dashboard →
          </Link>
        </section>

        <section className="animate-slide-up card-lux p-5 tablet:p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-fintech-muted">Ad Credit</p>
          <p className="mt-2 text-2xl font-bold text-fintech-highlight tablet:text-3xl">{formatCents(adCreditBalanceCents)}</p>
          <p className="mt-1 text-sm text-fintech-muted">Balance</p>
          <Link href="/dashboard/ads" className="mt-4 inline-block text-sm font-medium text-fintech-accent hover:underline">
            Watch ads →
          </Link>
        </section>
      </div>

      {/* ——— Convert to Ad Credit modal ——— */}
      {convertModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => !convertSubmitting && setConvertModal(false)}
        >
          <div className="card-lux w-full max-w-sm p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">Transfer to Ad Credit</h3>
            <p className="mt-1 text-sm text-fintech-muted">Move funds from balance. Minimum $1.</p>
            {convertError && <p className="mt-2 text-sm text-fintech-danger">{convertError}</p>}
            <form onSubmit={handleConvertToAdCredit} className="mt-4">
              <input
                type="number"
                step="0.01"
                min="1"
                max={balanceCents != null ? balanceCents / 100 : 0}
                value={convertAmount}
                onChange={(e) => setConvertAmount(e.target.value)}
                placeholder="Amount (USD)"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-fintech-muted focus:border-fintech-accent focus:outline-none"
              />
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConvertModal(false)}
                  disabled={convertSubmitting}
                  className="btn-press min-h-touch flex-1 rounded-xl border border-white/20 py-3 text-white transition-opacity hover:bg-white/5 active:opacity-90 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={convertSubmitting}
                  className="btn-press min-h-touch flex-1 rounded-xl bg-fintech-accent py-3 font-semibold text-white transition-opacity hover:opacity-90 active:opacity-90 disabled:opacity-50"
                >
                  {convertSubmitting ? "Converting…" : "Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ——— Account summary + Ad opportunities ——— */}
      <div className="grid grid-cols-1 gap-4 tablet:gap-5 lg:grid-cols-12">
        <section className="animate-slide-up card-lux p-5 tablet:p-6 lg:col-span-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">Ad Opportunities</h2>
          {(data.availableAds?.length ?? 0) === 0 ? (
            <p className="mt-3 text-fintech-muted">No ads available. Check back later.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(data.availableAds ?? []).map((ad) => (
                <li key={ad.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
                  <span className="font-medium text-white">{ad.title}</span>
                  <span className="text-fintech-success font-medium">+{formatCents(ad.rewardCents)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/dashboard/ads" className="mt-4 inline-block text-sm font-medium text-fintech-accent hover:underline">
            View all ads →
          </Link>
        </section>

        <section className="animate-slide-up card-lux p-5 tablet:p-6 lg:col-span-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">Summary</h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs text-fintech-muted">Total deposits</p>
              <p className="text-lg font-semibold text-white">{formatCents((data as { totalDepositsCents?: number }).totalDepositsCents ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-fintech-muted">Total earned</p>
              <p className="text-lg font-semibold text-fintech-success">{formatCents(totalEarningsCents)}</p>
            </div>
            <div>
              <p className="text-xs text-fintech-muted">Total withdrawn</p>
              <p className="text-lg font-semibold text-white">{formatCents(totalWithdrawnCents)}</p>
            </div>
            <div>
              <p className="text-xs text-fintech-muted">Membership</p>
              <p className="text-lg font-semibold text-white">{MARKETING_PLANS[planForUi].label}</p>
            </div>
          </div>
          <Link href="/dashboard/transactions" className="mt-4 inline-block text-sm font-medium text-fintech-accent hover:underline">
            Transaction history →
          </Link>
        </section>
      </div>

      {/* ——— Withdrawals + Referral link ——— */}
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 tablet:gap-5">
        <section className="animate-slide-up card-lux p-5 tablet:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">Withdrawals</h2>
          <p className="mt-3 text-sm text-fintech-muted">
            Pending: <span className="font-medium text-fintech-highlight">{withdrawals.filter((w) => w.status === "pending").length}</span>
            {" · "}
            Completed: <span className="font-medium text-fintech-success">{withdrawals.filter((w) => ["approved", "paid"].includes(w.status)).length}</span>
          </p>
          <Link href="/dashboard/withdraw" className="mt-4 inline-block text-sm font-medium text-fintech-accent hover:underline">
            Withdraw or view history →
          </Link>
        </section>
        <section className="animate-slide-up card-lux p-5 tablet:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">Referral link</h2>
          <code className="mt-3 block break-all rounded-xl bg-black/20 px-3 py-2 text-sm text-fintech-accent">
            {generateReferralLink(session.userId)}
          </code>
          <Link href="/dashboard/referrals" className="mt-4 inline-block text-sm font-medium text-fintech-accent hover:underline">
            Referral dashboard →
          </Link>
        </section>
      </div>

      {/* ——— Games & Rewards ——— */}
      <section className="animate-slide-up card-lux p-5 tablet:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">Games & Rewards</h2>
        <p className="mt-2 text-sm text-fintech-muted">Spin the wheel, daily bonuses, and more.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/dashboard/games"
            className="btn-press min-h-touch inline-flex items-center justify-center rounded-xl bg-fintech-accent px-5 py-3 font-medium text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Play Games
          </Link>
          <Link
            href="/dashboard/rewards"
            className="btn-press min-h-touch inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 font-medium text-white transition-colors hover:bg-white/5 active:scale-[0.98]"
          >
            Spin Wheel
          </Link>
          <Link
            href="/dashboard/rewards"
            className="btn-press min-h-touch inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 font-medium text-white transition-colors hover:bg-white/5 active:scale-[0.98]"
          >
            Daily Bonus
          </Link>
        </div>
      </section>

      {/* ——— Growth + Daily check-in ——— */}
      <section className="animate-slide-up card-lux p-5 tablet:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">Your Growth</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 tablet:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-xs text-fintech-muted">Total Referrals</p>
            <p className="text-2xl font-bold text-white">{growth?.totalReferrals ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-xs text-fintech-muted">Leaderboard</p>
            <p className="text-2xl font-bold text-white">{growth?.leaderboardRank != null ? `#${growth.leaderboardRank}` : "—"}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-xs text-fintech-muted">Badges</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(growth?.badges ?? []).length === 0 ? (
                <span className="text-sm text-fintech-muted">None yet</span>
              ) : (
                (growth?.badges ?? []).map((b) => (
                  <span key={b.code} className="rounded-full bg-fintech-accent/20 px-2 py-0.5 text-xs text-fintech-accent" title={b.name}>{b.icon} {b.name}</span>
                ))
              )}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-xs text-fintech-muted">Daily Check-In</p>
            <button
              type="button"
              onClick={handleDailyClaim}
              disabled={dailyClaiming || !growth?.canClaimDaily}
              className="btn-press min-h-touch mt-2 w-full rounded-xl border border-fintech-success/40 bg-fintech-success/10 py-3 font-medium text-fintech-success transition-opacity hover:bg-fintech-success/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {dailyClaiming ? "Claiming…" : growth?.canClaimDaily ? "Claim daily" : "Claimed today"}
            </button>
          </div>
        </div>
        <Link href="/dashboard/leaderboard" className="mt-4 inline-block text-sm font-medium text-fintech-accent hover:underline">
          View leaderboard →
        </Link>
      </section>

      {/* ——— Activity ——— */}
      <section className="animate-slide-up card-lux p-5 tablet:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">Recent Activity</h2>
        {activities.length === 0 ? (
          <p className="mt-3 text-fintech-muted">No recent activity.</p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {activities.slice(0, 20).map((a) => (
              <li key={a.id} className="flex items-center justify-between border-b border-white/[0.06] py-2 text-sm">
                <span className="truncate text-white">{a.description}</span>
                {a.amountCents != null && <span className="ml-2 shrink-0 font-medium text-fintech-success">{formatCents(a.amountCents)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ——— Announcements ——— */}
      {(data.announcements?.length ?? 0) > 0 && (
        <section className="animate-slide-up card-lux p-5 tablet:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">Platform News</h2>
          <ul className="mt-3 space-y-4">
            {(data.announcements ?? []).map((a) => (
              <li key={a.id}>
                <h3 className="font-semibold text-white">{a.title}</h3>
                <p className="mt-1 text-sm text-fintech-muted">{a.body}</p>
                <p className="mt-2 text-xs text-fintech-muted">{new Date(a.publishedAt).toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ——— Display ad (placement: dashboard) ——— */}
      <section className="animate-slide-up card-lux p-5 tablet:p-6 max-w-lg">
        <AdDisplay placement="dashboard" />
      </section>
    </div>
  );
}
