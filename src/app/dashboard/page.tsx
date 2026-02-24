"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync, type ClientSession } from "@/lib/session";
import { getDashboard, getWithdrawals, convertToAdCredit, getGrowth, getActivities, claimDailyReward, ensureReferralBonus } from "@/lib/api";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [withdrawals, setWithdrawals] = useState<{ id: string; amount: number; status: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const loadingStyle: React.CSSProperties = { color: "#9ca3af", minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" };
  if (session === "pending") {
    return <div className="flex items-center justify-center min-h-[60vh] text-fintech-muted" style={loadingStyle}>Loading…</div>;
  }
  if (session === null) {
    return <div className="flex items-center justify-center min-h-[60vh] text-fintech-muted" style={loadingStyle}>Redirecting to login…</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-fintech-muted" style={loadingStyle}>Loading dashboard…</div>;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-6 max-w-md text-center">
          <p className="text-red-400 mb-4">{error ?? "Failed to load dashboard"}</p>
          <button
            type="button"
            onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg transition"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const balanceCents = data.balanceCents ?? 0;
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Welcome to GarmonPay Dashboard</h1>
      <div className="grid gap-6 lg:grid-cols-12">
      {/* Today's Earnings Report — main feature */}
      <section className="lg:col-span-8 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-fintech-highlight uppercase tracking-wide mb-4 border-b border-fintech-highlight/30 pb-2">
          Today&apos;s Earnings Report
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-fintech-muted uppercase">Today</p>
            <p className="text-2xl font-bold text-fintech-money">{formatCents(data.earningsTodayCents)}</p>
          </div>
          <div>
            <p className="text-xs text-fintech-muted uppercase">This week</p>
            <p className="text-2xl font-bold text-fintech-money">{formatCents(data.earningsWeekCents)}</p>
          </div>
          <div>
            <p className="text-xs text-fintech-muted uppercase">This month</p>
            <p className="text-2xl font-bold text-fintech-money">{formatCents(data.earningsMonthCents)}</p>
          </div>
        </div>
      </section>

      {/* Account Summary */}
      <section className="lg:col-span-4 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Account Summary
        </h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-fintech-muted">Main Balance</p>
            <p className="text-xl font-bold text-fintech-money">{formatCents(balanceCents)}</p>
          </div>
          <div>
            <p className="text-xs text-fintech-muted">Ad Credit Balance</p>
            <p className="text-xl font-bold text-fintech-highlight">{formatCents(adCreditBalanceCents)}</p>
          </div>
          <div>
            <p className="text-xs text-fintech-muted">Total Earnings</p>
            <p className="text-lg font-semibold text-fintech-money">{formatCents(totalEarningsCents)}</p>
          </div>
          <div>
            <p className="text-xs text-fintech-muted">Total Withdrawn</p>
            <p className="text-lg font-semibold text-white">{formatCents(totalWithdrawnCents)}</p>
          </div>
          <div>
            <p className="text-xs text-fintech-muted">Membership Tier</p>
            <p className="text-lg font-semibold text-fintech-highlight capitalize">{data.membershipTier}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConvertModal(true)}
          disabled={balanceCents < 100}
          className="mt-4 w-full py-2 rounded-lg border border-fintech-accent text-fintech-accent text-sm font-medium hover:bg-fintech-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Convert Balance to Ad Credit
        </button>
        <Link
          href="/dashboard/transactions"
          className="mt-2 inline-block w-full text-center text-sm text-fintech-muted hover:text-fintech-accent"
        >
          View transaction history →
        </Link>
      </section>

      {convertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => !convertSubmitting && setConvertModal(false)}>
          <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Convert to Ad Credit</h3>
            <p className="text-sm text-fintech-muted mb-4">Move funds from Main Balance to Ad Credit. Minimum $1.</p>
            {convertError && <p className="text-sm text-red-400 mb-2">{convertError}</p>}
            <form onSubmit={handleConvertToAdCredit}>
              <input
                type="number"
                step="0.01"
                min="1"
                max={balanceCents / 100}
                value={convertAmount}
                onChange={(e) => setConvertAmount(e.target.value)}
                placeholder="Amount (USD)"
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white mb-4"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setConvertModal(false)} disabled={convertSubmitting} className="flex-1 py-2 rounded-lg border border-white/20 text-white text-sm">Cancel</button>
                <button type="submit" disabled={convertSubmitting} className="flex-1 py-2 rounded-lg bg-fintech-accent text-white text-sm font-medium disabled:opacity-50">{convertSubmitting ? "Converting…" : "Convert"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ad Opportunities — newspaper headlines */}
      <section className="lg:col-span-8 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Ad Opportunities
        </h2>
        <p className="text-sm text-fintech-muted mb-4">Available Ads</p>
        {(data.availableAds?.length ?? 0) === 0 ? (
          <p className="text-fintech-muted italic">No ads available at the moment. Check back later.</p>
        ) : (
          <ul className="space-y-3">
            {(data.availableAds ?? []).map((ad) => (
              <li
                key={ad.id}
                className="border-l-4 border-fintech-accent pl-4 py-2 hover:bg-white/5 rounded-r"
              >
                <span className="font-semibold text-white">{ad.title}</span>
                <span className="ml-2 text-fintech-money text-sm">+{formatCents(ad.rewardCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Withdrawals + Referral Section — same column */}
      <div className="lg:col-span-4 space-y-6">
      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Withdrawals
        </h2>
        <div className="space-y-3">
          <p className="text-sm text-fintech-muted">
            Pending: <span className="text-amber-400 font-medium">{withdrawals.filter((w) => w.status === "pending").length}</span>
            {" · "}
            Completed: <span className="text-green-400 font-medium">{withdrawals.filter((w) => ["approved", "paid"].includes(w.status)).length}</span>
          </p>
          {withdrawals.filter((w) => w.status === "pending").length > 0 && (
            <p className="text-xs text-fintech-muted">Your pending requests are under review.</p>
          )}
        </div>
        <Link
          href="/dashboard/withdraw"
          className="mt-4 inline-block text-sm text-fintech-accent hover:underline"
        >
          Withdraw or view history →
        </Link>
      </section>

      {/* Referral Section */}
      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Referrals
        </h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-fintech-muted mb-1">Your Referral Link:</p>
            <code className="block p-2 rounded bg-black/30 text-fintech-accent text-sm break-all">
              {typeof window !== "undefined"
                ? `${(process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "")}/register?ref=${data.referralCode ?? ""}`
                : `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://garmonpay.com").replace(/\/$/, "")}/register?ref=${data.referralCode ?? ""}`}
            </code>
          </div>
          <div>
            <p className="text-xs text-fintech-muted">Total referrals</p>
            <p className="text-xl font-bold text-white">{data.totalReferrals ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-fintech-muted">Referral earnings</p>
            <p className="text-xl font-bold text-fintech-money">{formatCents(data.referralEarningsCents ?? 0)}</p>
          </div>
        </div>
        <Link
          href="/dashboard/referrals"
          className="mt-4 inline-block text-sm text-fintech-accent hover:underline"
        >
          Referral dashboard →
        </Link>
      </section>

      {/* Referral Summary */}
      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Referral Summary
        </h2>
        <div className="space-y-3">
          <div className="flex justify-between items-baseline">
            <p className="text-xs text-fintech-muted">Total referrals</p>
            <p className="text-lg font-bold text-white">{data.totalReferrals}</p>
          </div>
          <div className="flex justify-between items-baseline">
            <p className="text-xs text-fintech-muted">One-time referral earnings</p>
            <p className="text-lg font-semibold text-fintech-money">{formatCents(data.referralEarningsCents)}</p>
          </div>
          {(data as { activeReferralSubscriptions?: number }).activeReferralSubscriptions != null && (
            <div className="flex justify-between items-baseline">
              <p className="text-xs text-fintech-muted">Active referral subscriptions</p>
              <p className="text-lg font-semibold text-white">{(data as { activeReferralSubscriptions?: number }).activeReferralSubscriptions}</p>
            </div>
          )}
          {(() => {
            const cents = (data as { monthlyReferralCommissionCents?: number }).monthlyReferralCommissionCents;
            return cents != null && cents > 0 && (
              <div className="flex justify-between items-baseline">
                <p className="text-xs text-fintech-muted">This month (recurring)</p>
                <p className="text-lg font-semibold text-fintech-money">{formatCents(cents)}</p>
              </div>
            );
          })()}
          {(() => {
            const cents = (data as { lifetimeReferralCommissionCents?: number }).lifetimeReferralCommissionCents;
            return cents != null && cents > 0 && (
              <div className="flex justify-between items-baseline">
                <p className="text-xs text-fintech-muted">Lifetime recurring</p>
                <p className="text-lg font-semibold text-fintech-money">{formatCents(cents)}</p>
              </div>
            );
          })()}
        </div>
      </section>
      </div>

      {/* Games & Rewards */}
      <section className="lg:col-span-12 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Games & Rewards
        </h2>
        <p className="text-sm text-fintech-muted mb-4">Spin the wheel, claim daily bonuses, and earn more.</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/games"
            className="inline-flex items-center px-5 py-2.5 rounded-lg bg-fintech-accent text-white font-medium hover:opacity-90 transition-opacity"
          >
            Play Games
          </Link>
          <Link
            href="/dashboard/rewards"
            className="inline-flex items-center px-5 py-2.5 rounded-lg border border-fintech-accent/60 text-fintech-accent font-medium hover:bg-fintech-accent/10 transition-colors"
          >
            Spin Wheel
          </Link>
          <Link
            href="/dashboard/rewards"
            className="inline-flex items-center px-5 py-2.5 rounded-lg border border-white/20 text-white font-medium hover:bg-white/5 transition-colors"
          >
            Daily Bonus
          </Link>
        </div>
      </section>

      {/* Your Growth — viral section */}
      <section className="lg:col-span-12 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-fintech-accent/30 pb-2 flex items-center gap-2">
          <span className="text-fintech-highlight">📈</span> Your Growth
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-fintech-muted uppercase">Total Referrals</p>
            <p className="text-2xl font-bold text-white mt-1">{growth?.totalReferrals ?? 0}</p>
          </div>
          <div className="rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-fintech-muted uppercase">Leaderboard Position</p>
            <p className="text-2xl font-bold text-fintech-highlight mt-1">
              {growth?.leaderboardRank != null ? `#${growth.leaderboardRank}` : "—"}
            </p>
          </div>
          <div className="rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-fintech-muted uppercase">Badges</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {(growth?.badges ?? []).length === 0 ? (
                <span className="text-fintech-muted text-sm">None yet</span>
              ) : (
                (growth?.badges ?? []).map((b) => (
                  <span key={b.code} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-fintech-accent/20 text-fintech-accent text-sm" title={b.name}>
                    {b.icon} {b.name}
                  </span>
                ))
              )}
            </div>
          </div>
          <div className="rounded-lg bg-black/20 border border-white/10 p-4 flex flex-col justify-center">
            <p className="text-xs text-fintech-muted uppercase mb-2">Daily Check-In</p>
            <button
              type="button"
              onClick={handleDailyClaim}
              disabled={dailyClaiming || !growth?.canClaimDaily}
              className="py-2 px-4 rounded-lg bg-fintech-money/20 border border-fintech-money/50 text-fintech-money font-medium hover:bg-fintech-money/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {dailyClaiming ? "Claiming…" : growth?.canClaimDaily ? "Daily Check-In" : "Claimed today"}
            </button>
          </div>
        </div>
        <Link href="/dashboard/leaderboard" className="text-sm text-fintech-accent hover:underline">
          View leaderboard →
        </Link>
      </section>

      {/* Live Activity Feed */}
      <section className="lg:col-span-12 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2 flex items-center gap-2">
          <span className="text-fintech-accent">◆</span> Live Activity
        </h2>
        {activities.length === 0 ? (
          <p className="text-fintech-muted italic">No recent activity.</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {activities.slice(0, 20).map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                <span className="text-white truncate">{a.description}</span>
                {a.amountCents != null && (
                  <span className="text-fintech-money font-medium shrink-0 ml-2">{formatCents(a.amountCents)}</span>
                )}
                <span className="text-fintech-muted text-xs shrink-0 ml-2">{new Date(a.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Announcements — Platform News */}
      <section className="lg:col-span-12 rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Platform News
        </h2>
        {(data.announcements?.length ?? 0) === 0 ? (
          <p className="text-fintech-muted italic">No announcements at this time.</p>
        ) : (
          <ul className="space-y-4">
            {(data.announcements ?? []).map((a) => (
              <li key={a.id}>
                <h3 className="font-semibold text-white">{a.title}</h3>
                <p className="text-sm text-fintech-muted mt-1">{a.body}</p>
                <p className="text-xs text-fintech-muted mt-2">{new Date(a.publishedAt).toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}
