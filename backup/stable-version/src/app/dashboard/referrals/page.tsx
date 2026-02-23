"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { getReferralDashboard } from "@/lib/api";
import { ReferralBannerCreator } from "@/components/banners/ReferralBannerCreator";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function tierLabel(tier: string) {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "—";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function ReferralsPage() {
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof getReferralDashboard>> | null>(null);
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
        return getReferralDashboard(tokenOrId, isToken).then(setData);
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

  if (error || !data) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-red-400">{error ?? "Failed to load referral dashboard."}</p>
      </div>
    );
  }

  const { summary, referralLink, referredUsers, earningsHistory } = data;

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h1 className="text-xl font-bold text-white mb-1">Referral Dashboard</h1>
        <p className="text-fintech-muted text-sm">
          Share your link to refer members. When they subscribe, you earn one-time and monthly commissions.
        </p>
      </div>

      {/* Referral summary */}
      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Referral Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-fintech-muted uppercase">Total referrals</p>
            <p className="text-xl font-bold text-white mt-1">{summary.totalReferrals}</p>
          </div>
          <div className="rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-fintech-muted uppercase">Active referrals</p>
            <p className="text-xl font-bold text-fintech-highlight mt-1">{summary.activeReferrals}</p>
          </div>
          <div className="rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-fintech-muted uppercase">Monthly referral income</p>
            <p className="text-xl font-bold text-fintech-money mt-1">{formatCents(summary.monthlyReferralIncomeCents)}</p>
          </div>
          <div className="rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-fintech-muted uppercase">Lifetime referral earnings</p>
            <p className="text-xl font-bold text-fintech-money mt-1">{formatCents(summary.lifetimeReferralEarningsCents)}</p>
          </div>
        </div>
      </section>

      {/* Referral link + copy */}
      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
          Your Referral Link
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <code className="flex-1 p-3 rounded-lg bg-black/30 border border-white/10 text-fintech-accent text-sm break-all">
            {referralLink || "—"}
          </code>
          <button
            type="button"
            onClick={copyLink}
            disabled={!referralLink}
            className="shrink-0 px-4 py-2 rounded-lg bg-fintech-accent text-white font-medium text-sm hover:bg-fintech-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </section>

      {/* Your Referral Banners */}
      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
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
                className="mt-2 px-4 py-2 rounded-lg bg-fintech-accent text-white font-medium text-sm hover:bg-fintech-accent/90"
              >
                {embedCopied ? "Copied!" : "Copy embed code"}
              </button>
            </div>
          </>
        )}
      </section>

      {/* Referred users table */}
      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6 overflow-hidden">
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
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Referred user</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Membership</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Status</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Monthly commission</th>
                  <th className="p-3 text-xs font-medium text-fintech-muted uppercase">Total earned</th>
                </tr>
              </thead>
              <tbody>
                {referredUsers.map((u) => (
                  <tr key={u.referredUserId} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 text-white font-mono text-sm">{u.email}</td>
                    <td className="p-3 text-fintech-highlight capitalize">{tierLabel(u.membership)}</td>
                    <td className="p-3">
                      <span className={u.status === "Active" ? "text-emerald-400" : "text-fintech-muted"}>
                        {u.status}
                      </span>
                    </td>
                    <td className="p-3 text-fintech-money">{formatCents(u.monthlyCommissionCents)}</td>
                    <td className="p-3 text-fintech-money font-medium">{formatCents(u.totalEarnedCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Referral earnings history */}
      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6 overflow-hidden">
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
                    <td className="p-3 text-fintech-money font-medium">+{formatCents(e.amountCents)}</td>
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
