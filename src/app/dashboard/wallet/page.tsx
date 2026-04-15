"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";
import { getSessionAsync } from "@/lib/session";
import { MAX_PAYMENT_CENTS, MIN_WALLET_FUND_CENTS } from "@/lib/security";
import { scToUsdDisplay } from "@/lib/coins";
import { useCoins } from "@/hooks/useCoins";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });

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
  const { sweepsCoins, goldCoins, usdBalance, loading: coinsLoading, refresh, formatUSD } = useCoins();
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [coinHistory, setCoinHistory] = useState<CoinEntry[]>([]);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");

  const [convertAmount, setConvertAmount] = useState(10);
  const [converting, setConverting] = useState(false);
  const [convertSuccess, setConvertSuccess] = useState<string | null>(null);
  const [convertApiErr, setConvertApiErr] = useState<string | null>(null);

  const balanceDollars = usdBalance / 100;
  const scFromConvertPreview =
    Number.isFinite(convertAmount) && convertAmount > 0 ? Math.round(convertAmount * 100) : 0;

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

  useEffect(() => {
    getSessionAsync().then((session) => {
      if (session) setUser({ id: session.userId, accessToken: session.accessToken });
    });
  }, []);

  useEffect(() => {
    if (!user?.accessToken || !success) return;
    void refresh();
  }, [user?.accessToken, success, refresh]);

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

  const handleConvertToSC = async () => {
    if (converting || convertAmount < 1) return;
    setConvertApiErr(null);
    setConvertSuccess(null);
    setConverting(true);
    try {
      const session = await getSessionAsync();
      if (!session?.accessToken) {
        setConvertApiErr("Not signed in.");
        return;
      }
      const amount_cents = Math.round(convertAmount * 100);
      const res = await fetch("/api/wallet/convert-to-sc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ amount_cents }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sc_awarded?: number;
        new_usd_balance?: number;
        message?: string;
      };
      if (res.ok && typeof data.sc_awarded === "number") {
        const awarded = data.sc_awarded;
        await refresh();
        setConvertSuccess(`You received ${awarded.toLocaleString()} GPay Coins (GPC).`);
        const h = await fetch("/api/coins/history?limit=25", {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (h.ok) {
          const j = await h.json();
          setCoinHistory(j.entries ?? []);
        }
        const wh = await fetch("/api/wallet/history?limit=20", {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (wh.ok) {
          const j = await wh.json();
          setHistory(j.entries ?? []);
        }
      } else {
        setConvertApiErr(typeof data.error === "string" ? data.error : "Conversion failed");
      }
    } finally {
      setConverting(false);
    }
  };

  const formatType = (t: string) => t.replace(/_/g, " ");

  return (
    <div className="w-full max-w-lg mx-auto space-y-6">
      {success && (
        <div className="rounded-xl bg-fintech-bg-card border border-emerald-500/30 p-6 text-center">
          <div className="text-4xl mb-2">✓</div>
          <p className="text-white font-medium">Payment successful</p>
        </div>
      )}

      {/* Top balances */}
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6 space-y-2">
        <p className="text-fintech-muted text-xs uppercase tracking-wider">Your balances</p>
        {!coinsLoading ? (
          <>
            <p className="text-white text-lg">
              🪙 Gold Coins:{" "}
              <span className="font-semibold tabular-nums">{formatUSD(usdBalance)}</span>
              <span className="text-fintech-muted text-sm ml-2">(USD wallet)</span>
            </p>
            <p className="text-white text-lg">
              ⭐ GPay Coins: <span className="font-semibold tabular-nums">{sweepsCoins.toLocaleString()} GPC</span>
              <span className="text-fintech-muted text-sm ml-2">(≈ {scToUsdDisplay(sweepsCoins)})</span>
            </p>
          </>
        ) : (
          <p className="text-fintech-muted text-sm">Loading balances…</p>
        )}
      </div>

      {/* Convert USD → GPay Coins */}
      <div
        id="convert-usd-sc"
        style={{
          background: "rgba(124,58,237,0.1)",
          border: "1px solid rgba(124,58,237,0.4)",
          borderRadius: 16,
          padding: 24,
          marginTop: 4,
        }}
      >
        <h3
          className={`${cinzel.className}`}
          style={{
            color: "#F5C842",
            fontSize: 16,
            marginBottom: 4,
          }}
        >
          ⭐ Convert USD to GPay Coins
        </h3>
        <p
          style={{
            color: "#888",
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          Use GPay Coins to play C-Lo and other games. $1.00 = 100 GPC
        </p>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {[5, 10, 20, 50].map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setConvertAmount(amount)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: convertAmount === amount ? "2px solid #F5C842" : "1px solid #333",
                background: convertAmount === amount ? "rgba(245,200,66,0.2)" : "transparent",
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ${amount}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ position: "relative", flex: 1, minWidth: 120 }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#F5C842",
                fontWeight: "bold",
              }}
            >
              $
            </span>
            <input
              type="number"
              value={convertAmount}
              onChange={(e) => setConvertAmount(Number(e.target.value))}
              min={1}
              max={Math.max(1, balanceDollars)}
              step={0.01}
              style={{
                width: "100%",
                padding: "12px 12px 12px 28px",
                background: "#1a0535",
                border: "1px solid #7C3AED",
                borderRadius: 8,
                color: "#fff",
                fontSize: 18,
              }}
            />
          </div>
          <div style={{ color: "#888", fontSize: 20 }}>→</div>
          <div
            style={{
              flex: 1,
              minWidth: 120,
              padding: 12,
              background: "#0D0520",
              border: "1px solid #10B981",
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            <span style={{ color: "#10B981", fontWeight: "bold", fontSize: 18 }}>
              {scFromConvertPreview.toLocaleString()} GPC
            </span>
          </div>
        </div>

        {convertApiErr && (
          <p className="text-red-400 text-sm mb-2 text-center">{convertApiErr}</p>
        )}
        {convertSuccess && (
          <p className="text-emerald-400 text-sm mb-2 text-center">{convertSuccess}</p>
        )}

        <button
          type="button"
          onClick={() => void handleConvertToSC()}
          disabled={converting || convertAmount < 1 || convertAmount > balanceDollars || coinsLoading}
          style={{
            width: "100%",
            padding: 14,
            background:
              converting || convertAmount < 1 || convertAmount > balanceDollars || coinsLoading ? "#333" : "linear-gradient(135deg, #F5C842, #D4A017)",
            color: converting || convertAmount < 1 || convertAmount > balanceDollars || coinsLoading ? "#666" : "#0e0118",
            border: "none",
            borderRadius: 10,
            fontWeight: "bold",
            fontSize: 16,
            cursor: converting || convertAmount < 1 || convertAmount > balanceDollars || coinsLoading ? "not-allowed" : "pointer",
          }}
        >
          {converting
            ? "Converting..."
            : `Convert $${Number.isFinite(convertAmount) ? convertAmount.toFixed(2) : "0.00"} → ${scFromConvertPreview.toLocaleString()} GPC`}
        </button>

        {convertAmount > balanceDollars && !coinsLoading && (
          <p
            style={{
              color: "#EF4444",
              fontSize: 12,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            Insufficient Gold Coins (USD) balance
          </p>
        )}

        <p
          style={{
            color: "#555",
            fontSize: 11,
            marginTop: 12,
            textAlign: "center",
          }}
        >
          One-way conversion. GPay Coins cannot be converted back to USD.
        </p>
      </div>

      <div className="rounded-xl bg-fintech-bg-card border border-amber-500/20 p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Gold Coins (USD wallet)</h2>
        {coinsLoading && user?.accessToken ? (
          <p className="text-fintech-muted text-sm">Loading…</p>
        ) : (
          <p className="text-2xl font-bold text-amber-200 tabular-nums">🪙 {formatUSD(usdBalance)}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <a
            href="#convert-usd-sc"
            className="inline-flex items-center justify-center rounded-xl bg-violet-600/80 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-600"
          >
            Convert to GPay Coins
          </a>
          <Link
            href="/dashboard/withdraw"
            className="inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/5"
          >
            Withdraw
          </Link>
          <Link
            href="/dashboard/buy-coins"
            className="inline-flex items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/40 px-4 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-500/30"
          >
            Buy Gold Coins (GC)
          </Link>
        </div>
      </div>

      <div className="rounded-xl bg-fintech-bg-card border border-violet-500/25 p-6">
        <h2 className="text-lg font-bold text-white mb-2">GPay Coins</h2>
        <p className="text-2xl font-bold text-violet-200">⭐ {sweepsCoins.toLocaleString()} GPC</p>
        <p className="text-sm text-fintech-muted mt-1">≈ {scToUsdDisplay(sweepsCoins)} value</p>
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="inline-flex rounded-xl border border-white/10 px-3 py-2 text-xs text-fintech-muted cursor-not-allowed">
            Redeem for $GPAY (soon)
          </span>
          <Link
            href="/games"
            className="inline-flex rounded-xl bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Use in Games
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
                  {c.gold_coins !== 0 && (
                    <span className="text-amber-200">
                      GC {c.gold_coins >= 0 ? "+" : ""}
                      {c.gold_coins}{" "}
                    </span>
                  )}
                  {c.sweeps_coins !== 0 && (
                    <span className="text-violet-200">
                      GPC {c.sweeps_coins >= 0 ? "+" : ""}
                      {c.sweeps_coins}
                    </span>
                  )}
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
