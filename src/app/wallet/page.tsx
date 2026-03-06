"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { getSessionAsync } from "@/lib/session";

type LedgerEntry = { id: string; type: string; amount: number; balance_after: number; reference: string | null; created_at: string };

function WalletContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "true" || searchParams.get("funded") === "true";
  const [user, setUser] = useState<{ id: string; accessToken?: string } | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");

  const handleDeposit = async () => {
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000) {
      setDepositError("Enter an amount between $1 and $1,000.");
      return;
    }
    setDepositError(null);
    setDepositLoading(true);
    try {
      const session = await getSessionAsync();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers,
        body: JSON.stringify({ amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setDepositError(data?.error || (res.status === 401 ? "Please sign in to deposit." : "Deposit unavailable. Try again."));
    } catch (e) {
      setDepositError("Network error. Please try again.");
    } finally {
      setDepositLoading(false);
    }
  };

  useEffect(() => {
    getSessionAsync().then((session) => {
      if (session) setUser({ id: session.userId, accessToken: session.accessToken });
    });
  }, []);

  useEffect(() => {
    if (!user?.accessToken) return;
    const headers: Record<string, string> = {};
    if (user.accessToken) headers.Authorization = `Bearer ${user.accessToken}`;
    fetch("/api/wallet", { headers })
      .then((res) => (res.ok ? res.json() : Promise.resolve({ balance_cents: 0 })))
      .then((data) => setBalanceCents(data.balance_cents ?? 0))
      .catch(() => setBalanceCents(0));
  }, [user?.accessToken, success]);

  useEffect(() => {
    if (!user?.accessToken) return;
    const headers: Record<string, string> = {};
    if (user.accessToken) headers.Authorization = `Bearer ${user.accessToken}`;
    fetch("/api/wallet/history?limit=20", { headers })
      .then((res) => (res.ok ? res.json() : Promise.resolve({ entries: [] })))
      .then((data) => setHistory(data.entries ?? []))
      .catch(() => setHistory([]));
  }, [user?.accessToken, success]);

  const formatType = (t: string) => t.replace(/_/g, " ");

  return (
    <div className="min-h-screen flex flex-col items-center p-6 bg-fintech-bg">
      <div className="w-full max-w-lg">
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 mb-6 text-center">
          {success ? (
            <>
              <div className="text-5xl mb-4">✓</div>
              <h1 className="text-2xl font-bold text-white mb-2">Funds added successfully</h1>
              <p className="text-fintech-muted mb-6">Your wallet has been topped up.</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Wallet</h1>
              {balanceCents !== null && (
                <p className="text-fintech-muted mb-2">
                  Current balance: <span className="text-white font-semibold text-xl">${((balanceCents ?? 0) / 100).toFixed(2)}</span>
                </p>
              )}
              {depositError && (
                <p className="text-red-400 text-sm mb-3">{depositError}</p>
              )}
              <input
                type="number"
                min={1}
                max={1000}
                step="0.01"
                placeholder="Amount ($1–$1,000)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3 text-white placeholder:text-fintech-muted focus:border-fintech-accent focus:outline-none mb-3"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleDeposit}
                  disabled={depositLoading}
                  className="flex-1 py-3 rounded-xl bg-fintech-accent text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {depositLoading ? "Redirecting…" : "Deposit"}
                </button>
                <Link
                  href="/dashboard/withdraw"
                  className="flex-1 py-3 rounded-xl border border-white/30 text-white font-semibold hover:bg-white/10 transition-colors text-center"
                >
                  Withdraw
                </Link>
              </div>
            </>
          )}
          <Link
            href="/dashboard"
            className="inline-block w-full py-3 mt-4 rounded-xl bg-fintech-accent text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
          <h2 className="text-lg font-bold text-white mb-3">Transaction history</h2>
          {history.length === 0 ? (
            <p className="text-fintech-muted text-sm">No ledger entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((e) => (
                <li key={e.id} className="flex justify-between items-center py-2 border-b border-white/5 text-sm">
                  <span className="text-fintech-muted">{formatType(e.type)}</span>
                  <span className={e.amount >= 0 ? "text-green-400" : "text-red-400"}>
                    {e.amount >= 0 ? "+" : ""}{(e.amount / 100).toFixed(2)}
                  </span>
                  <span className="text-fintech-muted text-xs">{new Date(e.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/dashboard/transactions"
            className="inline-block mt-3 text-sm text-fintech-accent hover:underline"
          >
            View full history
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-fintech-muted">Loading…</div>}>
      <WalletContent />
    </Suspense>
  );
}
