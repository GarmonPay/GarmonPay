"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync, type ClientSession } from "@/lib/session";
import { generateReferralLink } from "@/lib/referrals";
import { createBrowserClient } from "@/lib/supabase";
import {
  getDashboard,
  getWithdrawals,
  getGrowth,
  getActivities,
  claimDailyReward,
  ensureReferralBonus,
  convertToAdCredit,
} from "@/lib/api";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function DashboardPage() {
  const router = useRouter();
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
  const [balanceCentsFromSupabase, setBalanceCentsFromSupabase] = useState<number | null>(null);

  async function fetchBalance() {
    const supabase = createBrowserClient();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    const { data } = await supabase
      .from("users")
      .select("balance")
      .eq("id", user.id)
      .maybeSingle();
    if (data != null && typeof (data as { balance?: unknown }).balance !== "undefined") {
      const balance = Number((data as { balance: number }).balance ?? 0);
      setBalanceCentsFromSupabase(Math.round(balance));
    }
  }

  useEffect(() => {
    fetchBalance();
  }, []);

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
      fetchBalance();
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
            setError(null);
            setData({
              earningsTodayCents: 0,
              earningsWeekCents: 0,
              earningsMonthCents: 0,
              balanceCents: 0,
              adCreditBalanceCents: 0,
              withdrawableCents: 0,
              totalEarningsCents: 0,
              totalWithdrawnCents: 0,
              membershipTier: "starter",
              referralCode: "",
              referralEarningsCents: 0,
              totalReferrals: 0,
              activeReferralSubscriptions: 0,
              monthlyReferralCommissionCents: 0,
              lifetimeReferralCommissionCents: 0,
              announcements: [],
              availableAds: [],
            } as Awaited<ReturnType<typeof getDashboard>>);
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
          fetchBalance();
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
  }, [router]);

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

  const balanceCents = balanceCentsFromSupabase ?? data?.balanceCents ?? 0;
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
    if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > balanceCents) {
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
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setConvertSubmitting(false);
    }
  }

  const upgrade = async (tier: string) => {
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
    else if (session?.userId) headers["X-User-Id"] = session.userId;
    const res = await fetch("/api/stripe/add-funds", {
      method: "POST",
      headers,
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    if (data?.url) window.location.href = data.url;
    else if (data?.error) setCheckoutError(data.error);
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

  return (
    <div className="space-y-5 tablet:space-y-6">
      {/* ——— Wallet-style Balance Card ——— */}
      <section className="animate-slide-up card-lux overflow-hidden p-6 tablet:p-8">
        <p className="text-sm font-medium text-fintech-muted">Available Balance</p>
        <p className="mt-1 text-4xl font-bold tracking-tight text-white tablet:text-5xl">
          {formatCents(balanceCents)}
        </p>
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
            disabled={balanceCents < 100}
          >
            Transfer
          </button>
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
        <h2 className="text-lg font-bold text-white">Upgrade Membership</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => upgrade("starter")}
            className="btn-press min-h-touch rounded-xl bg-white/10 px-4 py-3 font-medium text-white hover:bg-white/20 active:scale-[0.98]"
          >
            Starter — $19
          </button>
          <button
            type="button"
            onClick={() => upgrade("pro")}
            className="btn-press min-h-touch rounded-xl bg-fintech-accent px-4 py-3 font-medium text-white hover:opacity-90 active:scale-[0.98]"
          >
            Pro — $49
          </button>
          <button
            type="button"
            onClick={() => upgrade("vip")}
            className="btn-press min-h-touch rounded-xl bg-fintech-highlight/80 px-4 py-3 font-medium text-white hover:opacity-90 active:scale-[0.98]"
          >
            VIP — $99
          </button>
        </div>
        <h2 className="mt-8 text-lg font-bold text-white" style={{ marginTop: "30px" }}>Wallet</h2>
        <p className="mt-1 text-sm text-fintech-muted">Click Deposit above to add funds ($5–$1,000).</p>
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
            <p className="mt-1 text-sm text-fintech-muted">Enter amount between $5 and $1,000.</p>
            {checkoutError && (
              <p className="mt-2 text-sm text-red-400">{checkoutError}</p>
            )}
            <input
              type="number"
              id="depositAmount"
              min={5}
              max={1000}
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
                max={balanceCents / 100}
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
              <p className="text-xs text-fintech-muted">Total earned</p>
              <p className="text-lg font-semibold text-fintech-success">{formatCents(totalEarningsCents)}</p>
            </div>
            <div>
              <p className="text-xs text-fintech-muted">Total withdrawn</p>
              <p className="text-lg font-semibold text-white">{formatCents(totalWithdrawnCents)}</p>
            </div>
            <div>
              <p className="text-xs text-fintech-muted">Membership</p>
              <p className="text-lg font-semibold text-white capitalize">{data.membershipTier}</p>
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
    </div>
  );
}
