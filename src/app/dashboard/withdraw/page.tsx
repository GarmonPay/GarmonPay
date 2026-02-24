"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { getDashboard, getWithdrawals, submitWithdrawalRequest } from "@/lib/api";

const METHODS = [
  { value: "crypto", label: "Crypto" },
  { value: "paypal", label: "PayPal" },
  { value: "bank", label: "Bank" },
];

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

type WithdrawalItem = {
  id: string;
  amount: number;
  status: string;
  method: string;
  wallet_address: string;
  created_at: string;
};

export default function WithdrawPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [minCents, setMinCents] = useState(100);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    method: "crypto" as string,
    wallet_address: "",
  });

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/withdraw");
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      setSession({ tokenOrId, isToken });
      Promise.all([
        getDashboard(tokenOrId, isToken),
        getWithdrawals(tokenOrId, isToken),
      ])
        .then(([dash, w]) => {
          setBalanceCents(dash.balanceCents);
          setMinCents(w.minWithdrawalCents);
          setWithdrawals(w.withdrawals);
        })
        .catch(() => setError("Failed to load data"))
        .finally(() => setLoading(false));
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    setSuccess(null);
    const amountCents = Math.round(parseFloat(form.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents < minCents) {
      setError(`Minimum withdrawal is ${formatCents(minCents)}`);
      return;
    }
    if (balanceCents != null && amountCents > balanceCents) {
      setError("Amount exceeds your balance");
      return;
    }
    if (!form.wallet_address.trim()) {
      setError("Wallet address is required");
      return;
    }
    setSubmitting(true);
    try {
      await submitWithdrawalRequest(session.tokenOrId, session.isToken, {
        amount: amountCents,
        method: form.method,
        wallet_address: form.wallet_address.trim(),
      });
      setSuccess("Withdrawal submitted. It will be reviewed by admin.");
      setForm({ amount: "", method: "crypto", wallet_address: "" });
      const w = await getWithdrawals(session.tokenOrId, session.isToken).catch(() => ({ withdrawals: [], minWithdrawalCents: 100 }));
      setWithdrawals(w?.withdrawals ?? []);
      const dash = await getDashboard(session.tokenOrId, session.isToken).catch(() => null);
      if (dash) setBalanceCents(dash.balanceCents ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

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
        <h1 className="text-xl font-bold text-white mb-2">Withdraw</h1>
        <p className="text-sm text-fintech-muted mb-6">
          Request a withdrawal. Funds are held until admin approval. Minimum withdrawal is {formatCents(minCents)}.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-5">
            <p className="text-sm text-fintech-muted">Current balance</p>
            <p className="text-2xl font-bold text-fintech-money">
              {balanceCents != null ? formatCents(balanceCents) : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-5">
            <p className="text-sm text-fintech-muted">Minimum withdrawal</p>
            <p className="text-2xl font-bold text-white">{formatCents(minCents)}</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
        )}
        {success && (
          <div className="mt-4 p-3 rounded-lg bg-green-500/20 text-green-400 text-sm">{success}</div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-fintech-muted mb-1">Amount (USD)</label>
            <input
              type="number"
              step="0.01"
              min={minCents / 100}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-fintech-muted focus:border-fintech-accent outline-none"
              placeholder="0.00"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fintech-muted mb-1">Withdrawal method</label>
            <select
              value={form.method}
              onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-fintech-accent outline-none"
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-fintech-muted mb-1">Wallet address / PayPal email</label>
            <input
              type="text"
              value={form.wallet_address}
              onChange={(e) => setForm((f) => ({ ...f, wallet_address: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-fintech-muted focus:border-fintech-accent outline-none"
              placeholder="Address or email"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting || (balanceCents != null && balanceCents < minCents)}
            className="w-full py-3 rounded-lg bg-fintech-accent text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit withdrawal"}
          </button>
        </form>
      </div>

      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white mb-4">Withdrawal history</h2>
        {withdrawals.length === 0 ? (
          <p className="text-fintech-muted">No withdrawals yet.</p>
        ) : (
          <ul className="space-y-3">
            {withdrawals.map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 border-b border-white/10 last:border-0"
              >
                <div>
                  <span className="font-semibold text-fintech-money">{formatCents(w.amount)}</span>
                  <span className="text-fintech-muted text-sm ml-2 capitalize">{w.method}</span>
                </div>
                <div className="text-sm text-fintech-muted">
                  <span className={`capitalize ${w.status === "pending" ? "text-amber-400" : w.status === "rejected" ? "text-red-400" : "text-green-400"}`}>
                    {w.status}
                  </span>
                  {" · "}
                  {formatDate(w.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
