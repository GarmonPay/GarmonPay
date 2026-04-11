"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { MAX_PAYMENT_CENTS, MIN_WALLET_FUND_CENTS } from "@/lib/security";
import { scToUsdDisplay } from "@/lib/coins";

type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  reference: string | null;
  created_at: string;
};

type CoinEntry = {
  id: string;
  type: string;
  gold_coins: number;
  sweeps_coins: number;
  description: string | null;
  created_at: string;
};

function WalletDashboardContent() {
  const searchParams = useSearchParams();
  const success =
    searchParams.get("success") === "true" ||
    searchParams.get("funded") === "true" ||
    searchParams.get("success") === "1";
  const [user, setUser] = useState<{ id: string; accessToken?: string } | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [goldCoins, setGoldCoins] = useState(0);
  const [sweepsCoins, setSweepsCoins] = useState(0);
  const [balanceLoad, setBalanceLoad] = useState<"idle" | "pending" | "ok" | "err">("idle");
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [coinHistory, setCoinHistory] = useState<CoinEntry[]>([]);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [convertAmount, setConvertAmount] = useState("");
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertErr, setConvertErr] = useState<string | null>(null);

  const handleDeposit = async () => {
    const amount = Number(depositAmount);
    const minDollars = MIN_WALLET_FUND_CENTS / 100;
    const maxDollars = MAX_PAYMENT_CENTS / 100;
    if (!Number.isFinite(amount) || amount < minDollars || amount > maxDollars) {
      setDepositError(`Enter an amount between $${minDollars.toFixed(2)} and $${maxDollars.toLocaleString()}.`);
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
      setDepositError(data?.error || (res.status === 401 ? "Please sign in to deposit." : "Deposit unavailable."));
    } catch {
      setDepositError("Network error.");
    } finally {
      setDepositLoading(false);
    }
  };

  const loadBalances = async () => {
    const session = await getSessionAsync();
    if (!session?.accessToken) return;
    const headers: Record<string, string> = { Authorization: `Bearer ${session.accessToken}` };
    const r = await fetch("/api/coins/balance", { headers });
    if (r.ok) {
      const d = (await r.json()) as { balance_cents?: number; gold_coins?: number; sweeps_coins?: number };
      setBalanceCents(typeof d.balance_cents === "number" ? d.balance_cents : 0);
      setGoldCoins(Math.floor(Number(d.gold_coins ?? 0)));
      setSweepsCoins(Math.floor(Number(d.sweeps_coins ?? 0)));
      setBalanceLoad("ok");
    } else {
      setBalanceLoad("err");
    }
  };

  useEffect(() => {
    getSessionAsync().then((session) => {
      if (session) setUser({ id: session.userId, accessToken: session.accessToken });
    });
  }, []);

  useEffect(() => {
    if (!user?.accessToken) return;
    setBalanceLoad("pending");
    loadBalances().catch(() => setBalanceLoad("err"));
  }, [user?.accessToken, success]);

  useEffect(() => {
    if (!user?.accessToken) return;
    const headers: Record<string, string> = { Authorization: `Bearer ${user.accessToken}` };
    fetch("/api/wallet/history?limit=20", { headers })
      .then((res) => (res.ok ? res.json() : Promise.resolve({ entries: [] })))
      .then((data) => setHistory(data.entries ?? []))
      .catch(() => setHistory([]));
    fetch("/api/coins/history?limit=25", { headers })
      .then((res) => (res.ok ? res.json() : Promise.resolve({ entries: [] })))
      .then((data) => setCoinHistory(data.entries ?? []))
      .catch(() => setCoinHistory([]));
  }, [user?.accessToken, success]);

  async function handleConvert() {
    const dollars = Number(convertAmount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setConvertErr("Enter a valid dollar amount.");
      return;
    }
    const amountCents = Math.round(dollars * 100);
    setConvertErr(null);
    setConvertBusy(true);
    try {
      const session = await getSessionAsync();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
      const res = await fetch("/api/coins/convert", {
        method: "POST",
        headers,
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConvertErr(typeof data.message === "string" ? data.message : "Conversion failed");
        return;
      }
      setConvertAmount("");
      await loadBalances();
      const h = await fetch("/api/coins/history?limit=25", { headers: { Authorization: `Bearer ${session?.accessToken ?? ""}` } });
      if (h.ok) {
        const j = await h.json();
        setCoinHistory(j.entries ?? []);
      }
    } finally {
      setConvertBusy(false);
    }
  }

  const dollarsToConvert = Number(convertAmount);
  const centsPreview =
    Number.isFinite(dollarsToConvert) && dollarsToConvert > 0 ? Math.round(dollarsToConvert * 100) : 0;
  const scPreview = centsPreview > 0 ? Math.floor((centsPreview * 100) / 100) : 0;

  const formatType = (t: string) => t.replace(/_/g, " ");

  return (
    <div className="w-full max-w-lg mx-auto space-y-6">
      {success && (
        <div className="rounded-xl bg-fintech-bg-card border border-emerald-500/30 p-6 text-center">
          <div className="text-4xl mb-2">✓</div>
          <p className="text-white font-medium">Payment successful</p>
        </div>
      )}

      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">USD balance</h2>
        {(balanceLoad === "pending" || balanceLoad === "idle") && user?.accessToken && (
          <p className="text-fintech-muted text-sm">Loading…</p>
        )}
        {balanceLoad === "err" && <p className="text-red-400 text-sm">Could not load balance.</p>}
        {balanceLoad === "ok" && balanceCents !== null && (
          <p className="text-fintech-muted">
            Available:{" "}
            <span className="text-white font-semibold text-xl">${(balanceCents / 100).toFixed(2)}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/withdraw"
            className="inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/5"
          >
            Withdraw
          </Link>
        </div>
        <div id="convert-usd" className="border-t border-white/10 pt-4">
          <p className="text-xs text-fintech-muted uppercase tracking-wider mb-2">Convert USD to Sweeps Coins</p>
          <p className="text-[11px] text-fintech-muted mb-2">
            Conversion is one-way. SC cannot be converted back to USD. $1 → 100 SC.
          </p>
          <input
            type="number"
            min={0.01}
            step={0.01}
            placeholder="Amount ($)"
            value={convertAmount}
            onChange={(e) => setConvertAmount(e.target.value)}
            className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-2.5 text-white mb-2"
          />
          {scPreview > 0 && (
            <p className="text-sm text-emerald-300/90 mb-2">You will receive ~{scPreview.toLocaleString()} SC</p>
          )}
          {convertErr && <p className="text-red-400 text-sm mb-2">{convertErr}</p>}
          <button
            type="button"
            disabled={convertBusy}
            onClick={handleConvert}
            className="w-full rounded-xl bg-violet-600 text-white font-semibold py-2.5 hover:opacity-95 disabled:opacity-50"
          >
            {convertBusy ? "Converting…" : "Convert to SC"}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-fintech-bg-card border border-amber-500/20 p-6">
        <h2 className="text-lg font-bold text-white mb-2">Gold Coins</h2>
        <p className="text-2xl font-bold text-amber-200">🪙 {goldCoins.toLocaleString()} GC</p>
        <Link
          href="/dashboard/buy-coins"
          className="mt-4 inline-block rounded-xl bg-amber-500/20 border border-amber-500/40 px-4 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-500/30"
        >
          Buy more GC
        </Link>
      </div>

      <div className="rounded-xl bg-fintech-bg-card border border-violet-500/25 p-6">
        <h2 className="text-lg font-bold text-white mb-2">Sweeps Coins</h2>
        <p className="text-2xl font-bold text-violet-200">
          ⭐ {sweepsCoins.toLocaleString()} SC
        </p>
        <p className="text-sm text-fintech-muted mt-1">≈ {scToUsdDisplay(sweepsCoins)} value</p>
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="inline-flex rounded-xl border border-white/10 px-3 py-2 text-xs text-fintech-muted cursor-not-allowed">
            Redeem for $GPAY (soon)
          </span>
          <Link
            href="/games/celo"
            className="inline-flex rounded-xl bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Use in games (C-Lo)
          </Link>
        </div>
      </div>

      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white mb-3">Add USD (Stripe)</h2>
        {depositError && <p className="text-red-400 text-sm mb-2">{depositError}</p>}
        <input
          type="number"
          min={MIN_WALLET_FUND_CENTS / 100}
          max={MAX_PAYMENT_CENTS / 100}
          step="0.01"
          placeholder={`Amount ($${(MIN_WALLET_FUND_CENTS / 100).toFixed(0)}+)`}
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3 text-white mb-3"
        />
        <button
          type="button"
          onClick={handleDeposit}
          disabled={depositLoading}
          className="w-full py-3 rounded-xl bg-fintech-accent text-white font-semibold disabled:opacity-60"
        >
          {depositLoading ? "Redirecting…" : "Deposit"}
        </button>
      </div>

      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white mb-3">USD ledger</h2>
        {history.length === 0 ? (
          <p className="text-fintech-muted text-sm">No entries yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((e) => (
              <li key={e.id} className="flex justify-between items-center py-2 border-b border-white/5 text-sm">
                <span className="text-fintech-muted">{formatType(e.type)}</span>
                <span className={e.amount >= 0 ? "text-green-400" : "text-red-400"}>
                  {e.amount >= 0 ? "+" : ""}
                  {(e.amount / 100).toFixed(2)}
                </span>
                <span className="text-fintech-muted text-xs">{new Date(e.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white mb-3">Coin activity</h2>
        {coinHistory.length === 0 ? (
          <p className="text-fintech-muted text-sm">No coin transactions yet.</p>
        ) : (
          <ul className="space-y-2">
            {coinHistory.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2 border-b border-white/5 text-sm">
                <span className="text-fintech-muted">{formatType(c.type)}</span>
                <span className="text-white/90">
                  {c.gold_coins !== 0 && <span className="text-amber-200">GC {c.gold_coins >= 0 ? "+" : ""}{c.gold_coins} </span>}
                  {c.sweeps_coins !== 0 && <span className="text-violet-200">SC {c.sweeps_coins >= 0 ? "+" : ""}{c.sweeps_coins}</span>}
                </span>
                <span className="text-fintech-muted text-xs w-full sm:w-auto">{new Date(c.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/dashboard/transactions" className="inline-block text-sm text-fintech-accent hover:underline">
        Full transaction history
      </Link>
    </div>
  );
}

export default function DashboardWalletPage() {
  return (
    <Suspense fallback={<div className="text-fintech-muted">Loading…</div>}>
      <WalletDashboardContent />
    </Suspense>
  );
}
