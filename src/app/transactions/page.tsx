"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getTransactions } from "@/lib/api";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

const TYPE_LABELS: Record<string, string> = {
  earning: "Earning",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  ad_credit: "Ad credit",
  referral: "Referral",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "text-amber-400",
  completed: "text-green-400",
  rejected: "text-red-400",
  cancelled: "text-fintech-muted",
};

type Tx = {
  id: string;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  created_at: string;
};

export default function TransactionsPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [totals, setTotals] = useState({ totalEarningsCents: 0, totalWithdrawnCents: 0, totalAdCreditConvertedCents: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/transactions");
        return;
      }
      setSession({ tokenOrId: s.accessToken ?? s.userId, isToken: !!s.accessToken });
      getTransactions(s.accessToken ?? s.userId, !!s.accessToken)
        .then((res) => {
          setTransactions(res.transactions);
          setTotals({
            totalEarningsCents: res.totalEarningsCents,
            totalWithdrawnCents: res.totalWithdrawnCents,
            totalAdCreditConvertedCents: res.totalAdCreditConvertedCents,
          });
        })
        .catch(() => setError("Failed to load transactions"))
        .finally(() => setLoading(false));
    });
  }, [router]);

  if (!session && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fintech-bg">
        <p className="text-fintech-muted">Redirecting to login…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fintech-bg">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fintech-bg">
      <header className="border-b border-white/10 bg-fintech-bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-bold text-white">GarmonPay</Link>
          <Link href="/dashboard" className="text-sm text-fintech-accent hover:underline">Dashboard</Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-4 tablet:p-6">
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
          <h1 className="text-xl font-bold text-white mb-2">Wallet Transactions</h1>
          <p className="text-sm text-fintech-muted mb-6">
            Deposit history, withdrawals, and earnings.
          </p>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 p-4 rounded-xl bg-black/20 border border-white/10">
            <div>
              <p className="text-xs text-fintech-muted uppercase">Total Earnings</p>
              <p className="text-lg font-bold text-fintech-money">{formatCents(totals.totalEarningsCents)}</p>
            </div>
            <div>
              <p className="text-xs text-fintech-muted uppercase">Withdrawn</p>
              <p className="text-lg font-bold text-white">{formatCents(totals.totalWithdrawnCents)}</p>
            </div>
            <div>
              <p className="text-xs text-fintech-muted uppercase">Ad Credit</p>
              <p className="text-lg font-bold text-fintech-highlight">{formatCents(totals.totalAdCreditConvertedCents)}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 bg-black/30">
                  <th className="p-3 text-xs font-semibold text-fintech-muted uppercase">Date</th>
                  <th className="p-3 text-xs font-semibold text-fintech-muted uppercase">Type</th>
                  <th className="p-3 text-xs font-semibold text-fintech-muted uppercase">Amount</th>
                  <th className="p-3 text-xs font-semibold text-fintech-muted uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-fintech-muted">
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const isCredit = ["earning", "referral", "deposit"].includes(tx.type);
                    const amountDisplay = isCredit
                      ? `+${formatCents(tx.amount)}`
                      : `-${formatCents(tx.amount)}`;
                    return (
                      <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-3 text-sm text-fintech-muted whitespace-nowrap">{formatDate(tx.created_at)}</td>
                        <td className="p-3 text-sm text-white">{TYPE_LABELS[tx.type] ?? tx.type}</td>
                        <td className={`p-3 text-sm font-medium ${isCredit ? "text-fintech-money" : "text-white"}`}>
                          {amountDisplay}
                        </td>
                        <td className="p-3">
                          <span className={`text-sm capitalize ${STATUS_STYLES[tx.status] ?? "text-fintech-muted"}`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
