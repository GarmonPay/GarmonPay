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
      <div className="card-lux p-6">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-lux p-6">
        <p className="mb-4 text-fintech-danger">{error}</p>
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
    <div className="space-y-4 tablet:space-y-6">
      <div className="animate-slide-up card-lux p-4 tablet:p-6">
        <h1 className="mb-2 text-xl font-bold text-white">Finance</h1>
        <p className="mb-4 text-sm text-fintech-muted tablet:mb-6">Balance and withdrawal management.</p>
        <div className="mb-6 grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-xs text-fintech-muted uppercase">Available Balance</p>
            <p className="text-2xl font-bold text-fintech-money mt-1">
              {formatCents(balanceCents ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-xs text-fintech-muted uppercase">Withdrawals</p>
            <p className="text-lg font-semibold text-white mt-1">
              Pending: {pending} · Completed: {completed}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 tablet:flex-row tablet:flex-wrap">
          <Link
            href="/dashboard/withdraw"
            className="btn-press min-h-touch inline-flex items-center justify-center rounded-xl bg-fintech-accent px-5 py-3 font-medium text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Withdraw
          </Link>
          <Link
            href="/dashboard/transactions"
            className="btn-press min-h-touch inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 font-medium text-white transition-colors hover:bg-white/5 active:scale-[0.98]"
          >
            Transaction history
          </Link>
        </div>
      </div>
    </div>
  );
}
