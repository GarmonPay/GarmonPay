"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getDashboard, getWithdrawals, submitWithdrawalRequest } from "@/lib/api";
import { WITHDRAWAL_METHOD_VALUES, type WithdrawalMethod } from "@/lib/withdrawal-methods";
import { formatUsdCents } from "@/lib/format-number";

const METHOD_LABELS: Record<WithdrawalMethod, string> = {
  gpay_tokens: "$GPAY (Solana wallet)",
  bank_transfer: "Bank transfer",
  cashapp: "Cash App",
  paypal: "PayPal",
};

export default function DashboardWithdrawPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawableCents, setWithdrawableCents] = useState<number | null>(null);
  const [minCents, setMinCents] = useState(1000);
  const [history, setHistory] = useState<
    { id: string; amount: number; status: string; method: string; wallet_address: string; created_at: string }[]
  >([]);

  const [amountUsd, setAmountUsd] = useState("");
  const [method, setMethod] = useState<WithdrawalMethod>("gpay_tokens");
  const [payoutDestination, setPayoutDestination] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/withdraw");
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      return Promise.all([getDashboard(tokenOrId, isToken), getWithdrawals(tokenOrId, isToken)])
        .then(([dash, wd]) => {
          if (cancelled) return;
          setWithdrawableCents(dash.withdrawableCents ?? 0);
          setMinCents(wd.minWithdrawalCents ?? 1000);
          setHistory(wd.withdrawals ?? []);
        })
        .catch(() => {
          if (!cancelled) setError("Unable to load withdrawal data.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const usd = parseFloat(amountUsd.replace(/,/g, ""));
    if (!Number.isFinite(usd) || usd <= 0) {
      setError("Enter a valid amount in USD.");
      return;
    }
    const amountCents = Math.round(usd * 100);
    const dest = payoutDestination.trim();
    if (!dest) {
      setError(
        method === "gpay_tokens"
          ? "Enter your Solana wallet address for $GPAY."
          : "Enter payout details (wallet, email, or tag as required for this method)."
      );
      return;
    }

    const session = await getSessionAsync();
    if (!session) {
      setError("Not signed in.");
      return;
    }
    const tokenOrId = session.accessToken ?? session.userId;
    const isToken = !!session.accessToken;

    setSubmitting(true);
    try {
      const res = await submitWithdrawalRequest(tokenOrId, isToken, {
        amount: amountCents,
        method,
        wallet_address: dest,
      });
      setMessage(res.message ?? "Withdrawal submitted.");
      setAmountUsd("");
      setPayoutDestination("");
      const wd = await getWithdrawals(tokenOrId, isToken);
      setHistory(wd.withdrawals ?? []);
      const dash = await getDashboard(tokenOrId, isToken);
      setWithdrawableCents(dash.withdrawableCents ?? 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-fintech-bg-card p-6">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-24">
      <div>
        <h1 className="text-xl font-bold text-white">Withdraw</h1>
        <p className="mt-1 text-sm text-fintech-muted">
          Cash out from your <strong className="text-white">withdrawable USD balance</strong> (earnings). Amounts are
          in US dollars; for $GPAY on Solana, select &quot;$GPAY (Solana wallet)&quot; and paste your address. To move{" "}
          <strong className="text-white">GPay Coins (GPC)</strong> to $GPAY, use{" "}
          <Link href="/dashboard/wallet" className="text-fintech-accent hover:underline">
            Wallet → Redeem
          </Link>
          .
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-fintech-muted">Available to withdraw</p>
        <p className="mt-1 text-2xl font-bold text-fintech-money tabular-nums">
          {withdrawableCents != null ? formatUsdCents(withdrawableCents) : "—"}
        </p>
        <p className="mt-2 text-xs text-fintech-muted">Minimum this session: {formatUsdCents(minCents)} (plan may vary).</p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 rounded-xl border border-white/10 bg-fintech-bg-card p-4 tablet:p-6">
        <div>
          <label className="block text-sm font-medium text-white" htmlFor="wd-amount-usd">
            Amount (USD)
          </label>
          <input
            id="wd-amount-usd"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 25.00"
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-fintech-accent"
          />
          <p className="mt-1 text-xs text-fintech-muted">
            Enter dollars; we send whole cents to the server. Not the same as GPC balance — use Wallet for GPC → $GPAY.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-white" htmlFor="wd-method">
            Payout method
          </label>
          <select
            id="wd-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as WithdrawalMethod)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-fintech-accent"
          >
            {WITHDRAWAL_METHOD_VALUES.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-white" htmlFor="wd-dest">
            {method === "gpay_tokens" ? "Solana wallet address" : "Payout destination"}
          </label>
          <textarea
            id="wd-dest"
            rows={method === "gpay_tokens" ? 2 : 3}
            placeholder={
              method === "gpay_tokens"
                ? "Solana public key (Base58)"
                : "Bank details, Cash App $tag, PayPal email, etc."
            }
            value={payoutDestination}
            onChange={(e) => setPayoutDestination(e.target.value)}
            className="mt-1 w-full resize-y rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm text-white outline-none focus:border-fintech-accent"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn-press min-h-touch w-full rounded-xl bg-fintech-highlight/90 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit withdrawal"}
        </button>
      </form>

      {history.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Recent requests</h2>
          <ul className="space-y-2 text-sm">
            {history.slice(0, 10).map((w) => (
              <li key={w.id} className="flex flex-wrap justify-between gap-2 border-b border-white/5 pb-2">
                <span className="text-fintech-money">{formatUsdCents(w.amount)}</span>
                <span className="text-fintech-muted">{w.status}</span>
                <span className="w-full truncate font-mono text-xs text-slate-400" title={w.method}>
                  {w.method}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-center text-sm text-fintech-muted">
        <Link href="/dashboard/wallet" className="text-fintech-accent hover:underline">
          Wallet &amp; GPC
        </Link>
      </p>
    </div>
  );
}
