"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { getSessionAsync } from "@/lib/session";

function WalletContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "true" || searchParams.get("funded") === "true";
  const [user, setUser] = useState<{ id: string; accessToken?: string } | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");

  const handleDeposit = async () => {
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount < 5 || amount > 1000) {
      setDepositError("Enter an amount between $5 and $1,000.");
      return;
    }
    setDepositError(null);
    setDepositLoading(true);
    try {
      const session = await getSessionAsync();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
      else if (session?.userId) headers["X-User-Id"] = session.userId;
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers,
        body: JSON.stringify({ amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 || !data?.url) {
        setDepositError(data?.message || "Deposit is unavailable. Check server configuration.");
        return;
      }
      window.location.href = data.url;
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
    fetch("/api/wallet/balance", {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.resolve({ balanceCents: 0 })))
      .then((data) => setBalanceCents(data.balanceCents ?? data.balance ?? 0))
      .catch(() => setBalanceCents(0));
  }, [user?.accessToken, success]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-fintech-bg">
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 max-w-md w-full text-center">
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
                Balance: <span className="text-white font-semibold">${((balanceCents ?? 0) / 100).toFixed(2)}</span>
              </p>
            )}
            <p className="text-fintech-muted mb-6">Add funds from your dashboard to get started.</p>
            {depositError && (
              <p className="text-red-400 text-sm mb-3">{depositError}</p>
            )}
            <input
              type="number"
              id="depositAmount"
              min={5}
              max={1000}
              step="0.01"
              placeholder="Enter amount ($5–$1,000)"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3 text-white placeholder:text-fintech-muted focus:border-fintech-accent focus:outline-none mb-3"
            />
            <button
              onClick={handleDeposit}
              disabled={depositLoading}
              className="inline-block w-full py-3 rounded-xl bg-fintech-accent text-white font-semibold hover:opacity-90 transition-opacity mb-3 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {depositLoading ? "Redirecting to checkout…" : "Deposit"}
            </button>
          </>
        )}
        <Link
          href="/dashboard"
          className="inline-block w-full py-3 rounded-xl bg-fintech-accent text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Back to Dashboard
        </Link>
        <Link
          href="/dashboard/transactions"
          className="inline-block w-full py-2 mt-2 text-sm text-fintech-muted hover:text-white"
        >
          View transaction history
        </Link>
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
