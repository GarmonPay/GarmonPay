"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { getTransactions } from "@/lib/api";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const TYPE_LABELS: Record<string, string> = {
  earning: "Ad / Earning",
  withdrawal: "Withdrawal",
  ad_credit: "Ad credit conversion",
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
        router.replace("/login?next=/dashboard/transactions");
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

  const msgStyle: React.CSSProperties = { color: "#9ca3af" };
  if (!session && !loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6" style={{ backgroundColor: "#111827" }}>
        <p className="text-fintech-muted" style={msgStyle}>Redirecting to login…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6" style={{ backgroundColor: "#111827" }}>
        <p className="text-fintech-muted" style={msgStyle}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h1 className="text-xl font-bold text-white mb-2">Transaction History</h1>
        <p className="text-sm text-fintech-muted mb-6">
          Full history of earnings, withdrawals, ad credit conversions, and referrals. Styled like a bank statement.
        </p>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        {/* Statement summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 p-4 rounded-xl bg-black/20 border border-white/10">
          <div>
            <p className="text-xs text-fintech-muted uppercase">Total Earnings</p>
            <p className="text-lg font-bold text-fintech-money">{formatCents(totals.totalEarningsCents)}</p>
          </div>
          <div>
            <p className="text-xs text-fintech-muted uppercase">Total Withdrawn</p>
            <p className="text-lg font-bold text-white">{formatCents(totals.totalWithdrawnCents)}</p>
          </div>
          <div>
            <p className="text-xs text-fintech-muted uppercase">Ad Credit Converted</p>
            <p className="text-lg font-bold text-fintech-highlight">{formatCents(totals.totalAdCreditConvertedCents)}</p>
          </div>
        </div>

        {/* Statement table */}
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 bg-black/30">
                <th className="p-3 text-xs font-semibold text-fintech-muted uppercase">Date</th>
                <th className="p-3 text-xs font-semibold text-fintech-muted uppercase">Type</th>
                <th className="p-3 text-xs font-semibold text-fintech-muted uppercase">Description</th>
                <th className="p-3 text-xs font-semibold text-fintech-muted uppercase">Status</th>
                <th className="p-3 text-xs font-semibold text-fintech-muted uppercase text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-fintech-muted">
                    No transactions yet.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isCredit = tx.type === "earning" || tx.type === "referral";
                  const isDebit = tx.type === "withdrawal" || tx.type === "ad_credit";
                  const amountDisplay = isCredit
                    ? `+${formatCents(tx.amount)}`
                    : isDebit
                      ? `-${formatCents(tx.amount)}`
                      : formatCents(tx.amount);
                  return (
                    <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 text-sm text-fintech-muted whitespace-nowrap">{formatDate(tx.created_at)}</td>
                      <td className="p-3 text-sm text-white">{TYPE_LABELS[tx.type] ?? tx.type}</td>
                      <td className="p-3 text-sm text-fintech-muted max-w-xs truncate">{tx.description ?? "—"}</td>
                      <td className="p-3">
                        <span className={`text-sm capitalize ${STATUS_STYLES[tx.status] ?? "text-fintech-muted"}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className={`p-3 text-sm font-medium text-right ${isCredit ? "text-fintech-money" : "text-white"}`}>
                        {amountDisplay}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
