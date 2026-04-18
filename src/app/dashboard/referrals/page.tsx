"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { getReferralDashboard } from "@/lib/api";
import { ReferralBannerCreator } from "@/components/banners/ReferralBannerCreator";
import { localeInt } from "@/lib/format-number";
import { gpcToUsdDisplay } from "@/lib/coins";

function formatGpc(gpc: number | null | undefined) {
  return `${localeInt(gpc)} GPC`;
}

function tierLabel(tier: string) {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "—";
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function ReferralsPage() {
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof getReferralDashboard>> | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ rank: number; email: string; totalReferrals: number; totalEarningsGpc: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  const load = useCallback(() => {
    getSessionAsync()
      .then((session) => {
        if (!session) {
          router.replace("/login?next=/dashboard/referrals");
          return;
        }
        const tokenOrId = session.accessToken ?? session.userId;
        const isToken = !!session.accessToken;
        return Promise.all([
          getReferralDashboard(tokenOrId, isToken).then(setData),
          fetch("/api/referrals/leaderboard?limit=10").then((r) => (r.ok ? r.json() : { leaderboard: [] })).then((d) => setLeaderboard(d.leaderboard ?? [])),
        ]);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const copyLink = useCallback(() => {
    if (!data?.referralLink) return;
    navigator.clipboard.writeText(data.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [data?.referralLink]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-fintech-muted">
        Loading referral dashboard…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-red-400">{error}</p>
        <button type="button" onClick={() => { setError(null); load(); }} className="mt-2 text-sm text-fintech-accent hover:underline">Try again</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-fintech-muted">Redirecting to sign in…</p>
      </div>
    );
  }

  const summary = data?.summary ?? { totalReferrals: 0, activeReferrals: 0, monthlyReferralIncomeGpc: 0, lifetimeReferralEarningsGpc: 0, referralCode: "" };
  const referralLink = data?.referralLink ?? "";
  const referredUsers = data?.referredUsers ?? [];
  const earningsHistory = data?.earningsHistory ?? [];

  return (
    <div className="space-y-4 tablet:space-y-6">
      <div className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
        <h1 className="text-xl font-bold text-white mb-1">Referral Dashboard</h1>
        <p className="text-fintech-muted text-sm">
          Share your link to refer members. When they subscribe, you earn one-time and monthly commissions.
        </p>
      </div>

      {/* Referral summary */}
      <section className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Referral Summary
        </h2>
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 tablet:gap-4 lg:grid-cols-4">
          <div className="rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-fintech-muted uppercase">Total referrals</p>
            <p className="text-xl font-bold text-white mt-1">{summary.totalReferrals}</p>
          </div>
          <div className="rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-fintech-muted uppercase">Active (paid members)</p>
            <p className="text-xl font-bold text-fintech-highlight mt-1">{summary.activeReferrals}</p>
          </div>
          <div className="rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-fintech-muted uppercase">This month (referrals)</p>
            <p className="text-xl font-bold text-fintech-money mt-1">{formatGpc(summary.monthlyReferralIncomeGpc)}</p>
          </div>
          <div className="rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-fintech-muted uppercase">Total earned</p>
            <p className="text-xl font-bold text-fintech-money mt-1">{formatGpc(summary.lifetimeReferralEarningsGpc)}</p>
            <p className="text-xs text-fintech-muted mt-1">{gpcToUsdDisplay(summary.lifetimeReferralEarningsGpc)} face value</p>
          </div>
        </div>
      </section>

      {/* Commission structure */}
      <section className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6 overflow-hidden">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Upgrade commission rates
        </h2>
        <p className="text-fintech-muted text-sm mb-4">
          When your referrals upgrade, you earn a percentage of their upgrade payment in GPay Coins (100 GPC = $1.00 face value).
        </p>
        <div className="overflow-x-auto -mx-6 sm:mx-0">
          <table className="w-full text-left min-w-[280px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Your plan</th>
                <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Commission per upgrade</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Free", "10%"],
                ["Starter", "20%"],
                ["Growth", "30%"],
                ["Pro", "40%"],
                ["Elite", "50%"],
              ].map(([plan, pct]) => (
                <tr key={plan} className="border-b border-white/5">
                  <td className="p-3 text-white">{plan}</td>
                  <td className="p-3 text-fintech-money font-medium">{pct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Referral link + copy */}
      <section className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Your Referral Link
        </h2>
        <div className="flex flex-col gap-3 tablet:flex-row">
          <code className="flex-1 p-3 rounded-xl bg-black/30 border border-white/10 text-fintech-accent text-sm break-all">
            {referralLink || "—"}
          </code>
          <button
            type="button"
            onClick={copyLink}
            disabled={!referralLink}
            className="min-h-touch shrink-0 rounded-xl px-4 py-3 bg-fintech-accent text-white font-medium transition-opacity hover:bg-fintech-accent/90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-fintech-muted text-sm mt-3 mb-2">Share to:</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Join GarmonPay and earn through games and referrals. Use my link and get a signup bonus. " + (referralLink || ""))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1da1f2] text-white text-sm font-medium hover:opacity-90"
          >
            Twitter
          </a>
          <a
            href={`https://wa.me/?text=${encodeURIComponent("Join GarmonPay and earn through games and referrals. Use my link and get a signup bonus. " + (referralLink || ""))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#25d366] text-white text-sm font-medium hover:opacity-90"
          >
            WhatsApp
          </a>
          <a
            href={`sms:?&body=${encodeURIComponent("Join GarmonPay and earn through games and referrals. Use my link and get a signup bonus. " + (referralLink || ""))}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-600 text-white text-sm font-medium hover:opacity-90"
          >
            SMS
          </a>
        </div>
      </section>

      {/* Your Referral Banners */}
      <section className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Your Referral Banners
        </h2>
        <p className="text-fintech-muted text-sm mb-4">
          Create a banner with your referral link. Download, share, or use the embed code on your site.
        </p>
        {referralLink && (
          <>
            <ReferralBannerCreator referralLink={referralLink} />
            <div className="mt-6">
              <label className="block text-sm font-medium text-fintech-muted mb-2">Embed code (link)</label>
              <textarea
                readOnly
                value={`<a href="${referralLink}" target="_blank" rel="noopener">Join GarmonPay — Earn with us</a>`}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-fintech-accent text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  const code = `<a href="${referralLink}" target="_blank" rel="noopener">Join GarmonPay — Earn with us</a>`;
                  navigator.clipboard.writeText(code).then(() => {
                    setEmbedCopied(true);
                    setTimeout(() => setEmbedCopied(false), 2000);
                  });
                }}
                className="min-h-touch mt-2 w-full rounded-xl px-4 py-3 bg-fintech-accent text-white font-medium transition-opacity hover:bg-fintech-accent/90 active:scale-[0.98] tablet:w-auto"
              >
                {embedCopied ? "Copied!" : "Copy embed code"}
              </button>
            </div>
          </>
        )}
      </section>

      {/* Referred users table */}
      <section className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6 overflow-hidden">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Referral leaderboard
        </h2>
        {leaderboard.length === 0 ? (
          <p className="text-fintech-muted italic">No leaderboard data yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-6 sm:mx-0">
            <table className="w-full text-left min-w-[320px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Rank</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">User</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Referrals</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Earnings</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={row.rank} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 text-white font-medium">#{row.rank}</td>
                    <td className="p-3 text-fintech-muted text-sm">{row.email}</td>
                    <td className="p-3 text-white">{row.totalReferrals}</td>
                    <td className="p-3 text-fintech-money">{formatGpc(row.totalEarningsGpc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Referred users table */}
      <section className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6 overflow-hidden">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Referred Users
        </h2>
        {referredUsers.length === 0 ? (
          <p className="text-fintech-muted italic">No referred users yet. Share your referral link to get started.</p>
        ) : (
          <div className="overflow-x-auto -mx-6 sm:mx-0">
            <table className="w-full text-left min-w-[520px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Name</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Joined</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Plan</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Status</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Commission earned</th>
                </tr>
              </thead>
              <tbody>
                {referredUsers.map((u) => (
                  <tr key={u.referredUserId} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 text-white text-sm">{u.name ?? u.email}</td>
                    <td className="p-3 text-fintech-muted text-sm whitespace-nowrap">{formatDate(u.joinedAt)}</td>
                    <td className="p-3 text-fintech-highlight capitalize">{tierLabel(u.membership)}</td>
                    <td className="p-3">
                      <span className={u.status === "Active" ? "text-emerald-400" : "text-fintech-muted"}>
                        {u.status}
                      </span>
                    </td>
                    <td className="p-3 text-fintech-money font-medium">{formatGpc(u.totalEarnedGpc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Referral earnings history */}
      <section className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6 overflow-hidden">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Referral Earnings History
        </h2>
        {earningsHistory.length === 0 ? (
          <p className="text-fintech-muted italic">No referral earnings yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-6 sm:mx-0">
            <table className="w-full text-left min-w-[400px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Date</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Type</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Description</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Amount</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {earningsHistory.map((e) => (
                  <tr key={e.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 text-fintech-muted text-sm whitespace-nowrap">{formatDate(e.createdAt)}</td>
                    <td className="p-3 text-white capitalize">{e.type.replace("_", " ")}</td>
                    <td className="p-3 text-fintech-muted text-sm">{e.description}</td>
                    <td className="p-3 text-fintech-money font-medium">+{formatGpc(e.amountGpc)}</td>
                    <td className="p-3">
                      <span className={e.status === "completed" ? "text-emerald-400" : "text-amber-400"}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
