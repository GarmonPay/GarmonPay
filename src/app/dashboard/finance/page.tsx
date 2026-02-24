"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getDashboard, getWithdrawals } from "@/lib/api";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function FinancePage() {
  const router = useRouter();
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [withdrawals, setWithdrawals] = useState<{ id: string; amount: number; status: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync()
      .then((s) => {
        if (!s) {
          router.replace("/login?next=/dashboard/finance");
          return;
        }
        const tokenOrId = s.accessToken ?? s.userId;
        const isToken = !!s.accessToken;
        return Promise.all([
          getDashboard(tokenOrId, isToken),
          getWithdrawals(tokenOrId, isToken).catch(() => ({ withdrawals: [], minWithdrawalCents: 100 })),
        ]).then(([dash, w]) => {
          setBalanceCents(dash.balanceCents ?? 0);
          setWithdrawals(w?.withdrawals ?? []);
        });
      })
      .catch(() => setError("Unable to load finance data"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-red-400 mb-4">{error}</p>
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

  const pending = withdrawals.filter((w) => w.status === "pending").length;
  const completed = withdrawals.filter((w) => ["approved", "paid"].includes(w.status)).length;

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h1 className="text-xl font-bold text-white mb-2">Finance</h1>
        <p className="text-fintech-muted text-sm mb-6">Balance and withdrawal management.</p>
        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          <div className="p-4 rounded-lg bg-black/20 border border-white/10">
            <p className="text-xs text-fintech-muted uppercase">Available Balance</p>
            <p className="text-2xl font-bold text-fintech-money mt-1">
              {formatCents(balanceCents ?? 0)}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-black/20 border border-white/10">
            <p className="text-xs text-fintech-muted uppercase">Withdrawals</p>
            <p className="text-lg font-semibold text-white mt-1">
              Pending: {pending} · Completed: {completed}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/withdraw"
            className="inline-flex items-center px-5 py-2.5 rounded-lg bg-fintech-accent text-white font-medium hover:opacity-90"
          >
            Withdraw
          </Link>
          <Link
            href="/dashboard/transactions"
            className="inline-flex items-center px-5 py-2.5 rounded-lg border border-white/20 text-white font-medium hover:bg-white/5"
          >
            Transaction history
          </Link>
        </div>
      </div>
    </div>
  );
}
