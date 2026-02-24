"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getDashboard, getTransactions } from "@/lib/api";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function EarningsPage() {
  const router = useRouter();
  const [data, setData] = useState<{
    earningsTodayCents: number;
    earningsWeekCents: number;
    earningsMonthCents: number;
    totalEarningsCents: number;
    totalWithdrawnCents: number;
    referralEarningsCents: number;
  } | null>(null);
  const [transactions, setTransactions] = useState<{ type: string; amount: number; status: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync()
      .then((s) => {
        if (!s) {
          router.replace("/login?next=/dashboard/earnings");
          return;
        }
        const tokenOrId = s.accessToken ?? s.userId;
        const isToken = !!s.accessToken;
        return Promise.all([
          getDashboard(tokenOrId, isToken),
          getTransactions(tokenOrId, isToken).catch(() => ({ transactions: [], totalEarningsCents: 0, totalWithdrawnCents: 0, totalAdCreditConvertedCents: 0 })),
        ]).then(([dash, tx]) => {
          setData({
            earningsTodayCents: dash.earningsTodayCents ?? 0,
            earningsWeekCents: dash.earningsWeekCents ?? 0,
            earningsMonthCents: dash.earningsMonthCents ?? 0,
            totalEarningsCents: dash.totalEarningsCents ?? tx.totalEarningsCents ?? 0,
            totalWithdrawnCents: dash.totalWithdrawnCents ?? tx.totalWithdrawnCents ?? 0,
            referralEarningsCents: dash.referralEarningsCents ?? 0,
          });
          setTransactions(tx.transactions ?? []);
        });
      })
      .catch(() => setError("Unable to load earnings"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-red-400 mb-4">{error ?? "Failed to load earnings"}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-sm text-fintech-accent hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h1 className="text-xl font-bold text-white mb-2">Earnings</h1>
        <p className="text-fintech-muted text-sm mb-6">Earnings history and breakdown.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="p-4 rounded-lg bg-black/20 border border-white/10">
            <p className="text-xs text-fintech-muted uppercase">Today</p>
            <p className="text-xl font-bold text-fintech-money mt-1">{formatCents(data.earningsTodayCents)}</p>
          </div>
          <div className="p-4 rounded-lg bg-black/20 border border-white/10">
            <p className="text-xs text-fintech-muted uppercase">This week</p>
            <p className="text-xl font-bold text-fintech-money mt-1">{formatCents(data.earningsWeekCents)}</p>
          </div>
          <div className="p-4 rounded-lg bg-black/20 border border-white/10">
            <p className="text-xs text-fintech-muted uppercase">This month</p>
            <p className="text-xl font-bold text-fintech-money mt-1">{formatCents(data.earningsMonthCents)}</p>
          </div>
          <div className="p-4 rounded-lg bg-black/20 border border-white/10">
            <p className="text-xs text-fintech-muted uppercase">Total earned</p>
            <p className="text-xl font-bold text-fintech-money mt-1">{formatCents(data.totalEarningsCents)}</p>
          </div>
        </div>
        <div className="flex justify-between items-baseline mb-4">
          <p className="text-sm text-fintech-muted">Referral earnings</p>
          <p className="text-lg font-semibold text-fintech-money">{formatCents(data.referralEarningsCents)}</p>
        </div>
        <Link
          href="/dashboard/transactions"
          className="text-sm text-fintech-accent hover:underline"
        >
          View full transaction history →
        </Link>
      </div>
      {transactions.length > 0 && (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
          <h2 className="text-lg font-bold text-white mb-4">Recent activity</h2>
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {transactions.slice(0, 20).map((t) => (
              <li key={(t as { id?: string }).id ?? t.created_at} className="flex justify-between py-2 border-b border-white/5 text-sm">
                <span className="text-white capitalize">{t.type.replace(/_/g, " ")}</span>
                <span className="text-fintech-money font-medium">{formatCents(t.amount)}</span>
                <span className="text-fintech-muted text-xs">{new Date(t.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
