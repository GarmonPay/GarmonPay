"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";
import { getSessionAsync } from "@/lib/session";
import { MAX_PAYMENT_CENTS, MIN_WALLET_FUND_CENTS } from "@/lib/security";
import { gpcToUsdDisplay } from "@/lib/coins";
import { useCoins } from "@/hooks/useCoins";
import { GOLD_COIN_PACKAGES, type GoldCoinPackageId } from "@/lib/gold-coin-packages";
import { createBrowserClient } from "@/lib/supabase";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });

type CoinEntry = {
  id: string;
  type: string;
  gold_coins: number;
  gpay_coins: number;
  description: string | null;
  created_at: string;
};

type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  reference: string | null;
  created_at: string;
};

function tierToRateLabel(tierRaw: string): { rate: number; label: string } {
  const t = tierRaw.toLowerCase();
  if (t.includes("elite") || t.includes("vip")) return { rate: 1.0, label: "Elite" };
  if (t.includes("pro")) return { rate: 0.95, label: "Pro" };
  if (t.includes("growth")) return { rate: 0.9, label: "Growth" };
  if (t.includes("starter")) return { rate: 0.85, label: "Starter" };
  return { rate: 0.8, label: "Free" };
}

function WalletDashboardContent() {
  const searchParams = useSearchParams();
  const purchased = searchParams.get("purchased") === "true";
  const success =
    searchParams.get("success") === "true" ||
    searchParams.get("funded") === "true" ||
    searchParams.get("success") === "1";

  const { goldCoins, gpayCoins, gpayTokens, usdBalance, loading: coinsLoading, refresh } = useCoins();
  const [user, setUser] = useState<{ id: string; accessToken?: string } | null>(null);
  const [tierRaw, setTierRaw] = useState<string>("free");
  const [coinHistory, setCoinHistory] = useState<CoinEntry[]>([]);
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [gpayUsd, setGpayUsd] = useState<number | null>(null);

  const [showBuy, setShowBuy] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [convertGc, setConvertGc] = useState(100);
  const [convertErr, setConvertErr] = useState<string | null>(null);
  const [convertOk, setConvertOk] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [redeemGpc, setRedeemGpc] = useState(100);
  const [redeemStep, setRedeemStep] = useState<1 | 2 | 3>(1);
  const [walletAddr, setWalletAddr] = useState("");
  const [redeemCustodial, setRedeemCustodial] = useState(false);
  const [redeemErr, setRedeemErr] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemOk, setRedeemOk] = useState<string | null>(null);

  const { rate: tierRate, label: tierLabel } = tierToRateLabel(tierRaw);
  const previewGpc = Math.floor(convertGc * tierRate);

  useEffect(() => {
    getSessionAsync().then((session) => {
      if (session) setUser({ id: session.userId, accessToken: session.accessToken });
    });
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase || !user?.id) return;
    void supabase
      .from("users")
      .select("membership_tier, membership")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const r = data as { membership_tier?: string; membership?: string } | null;
        const tr = (r?.membership_tier ?? r?.membership ?? "free").trim();
        setTierRaw(tr || "free");
      });
  }, [user?.id]);

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
  }, [user?.accessToken, success, purchased]);

  useEffect(() => {
    fetch("/api/tokens/gpay-price")
      .then((r) => r.json())
      .then((d: { usd?: number | null }) => setGpayUsd(typeof d.usd === "number" ? d.usd : null))
      .catch(() => setGpayUsd(null));
  }, []);

  useEffect(() => {
    if (user?.accessToken && (success || purchased)) void refresh();
  }, [user?.accessToken, success, purchased, refresh]);

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

  const runConvert = async () => {
    if (converting || convertGc < 100 || convertGc % 100 !== 0) return;
    setConvertErr(null);
    setConvertOk(null);
    setConverting(true);
    try {
      const session = await getSessionAsync();
      if (!session?.accessToken) {
        setConvertErr("Not signed in.");
        return;
      }
      const res = await fetch("/api/coins/convert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ amount_gc: convertGc }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; gpay_coins_received?: number };
      if (!res.ok) {
        setConvertErr(typeof data.message === "string" ? data.message : "Conversion failed");
        return;
      }
      await refresh();
      setConvertOk(`You received ${data.gpay_coins_received ?? previewGpc} GPC.`);
      const h = await fetch("/api/coins/history?limit=25", {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (h.ok) {
        const j = await h.json();
        setCoinHistory(j.entries ?? []);
      }
    } finally {
      setConverting(false);
    }
  };

  const runRedeem = async () => {
    if (redeeming || redeemGpc < 100) return;
    setRedeemErr(null);
    setRedeeming(true);
    try {
      const session = await getSessionAsync();
      if (!session?.accessToken) {
        setRedeemErr("Not signed in.");
        return;
      }
      const res = await fetch("/api/coins/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify(
          redeemCustodial
            ? { amount_gpc: redeemGpc, custodial: true }
            : { amount_gpc: redeemGpc, wallet_address: walletAddr.trim() }
        ),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; ok?: boolean };
      if (!res.ok) {
        setRedeemErr(typeof data.message === "string" ? data.message : "Redemption failed");
        return;
      }
      await refresh();
      setRedeemStep(3);
      setRedeemOk(`${redeemGpc} $GPAY Tokens redeemed!`);
    } finally {
      setRedeeming(false);
    }
  };

  async function buyGoldPack(packageId: GoldCoinPackageId) {
    try {
      const session = await getSessionAsync();
      if (!session?.accessToken) return;
      const res = await fetch("/api/stripe/gold-coins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.url) {
        window.location.href = data.url as string;
      }
    } catch {
      /* ignore */
    }
  }

  const formatType = (t: string) => t.replace(/_/g, " ");

  return (
    <div className="w-full max-w-lg mx-auto space-y-6 pb-12">
      {(success || purchased) && (
        <div className="rounded-xl bg-fintech-bg-card border border-emerald-500/30 p-6 text-center">
          <div className="text-4xl mb-2">✓</div>
          <p className="text-white font-medium">{purchased ? "Purchase successful" : "Payment successful"}</p>
        </div>
      )}

      {/* SECTION 1 — Gold Coins */}
      <section className="rounded-xl border border-[#F5C842]/50 bg-black/30 p-6 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className={`${cinzel.className} text-lg text-[#F5C842]`}>🪙 Gold Coins</h2>
        </div>
        <p className="text-3xl font-bold tabular-nums text-[#F5C842]">
          {coinsLoading ? "…" : goldCoins.toLocaleString()} GC
        </p>
        <p className="text-sm text-violet-200/80">Convert to GPay Coins to play prize games</p>
        <p className="text-xs text-fintech-muted">
          Your rate: 100 GC → {Math.floor(100 * tierRate)} GPC ({tierLabel})
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={() => setShowBuy(true)}
            className="rounded-xl bg-[#F5C842] px-4 py-2.5 text-sm font-bold text-black hover:opacity-95"
          >
            BUY MORE GOLD COINS
          </button>
          <button
            type="button"
            onClick={() => {
              setShowConvert(true);
              setConvertErr(null);
              setConvertOk(null);
            }}
            className="rounded-xl border border-[#A855F7]/60 bg-[#A855F7]/20 px-4 py-2.5 text-sm font-semibold text-violet-100"
          >
            CONVERT TO GPAY COINS
          </button>
        </div>
      </section>

      {/* SECTION 2 — GPay Coins */}
      <section id="convert" className="rounded-xl border border-[#A855F7]/45 bg-[#1a0528]/80 p-6 space-y-3">
        <h2 className={`${cinzel.className} text-lg text-[#A855F7]`}>💜 GPay Coins</h2>
        <p className="text-3xl font-bold tabular-nums text-[#A855F7]">
          {coinsLoading ? "…" : gpayCoins.toLocaleString()} GPC
        </p>
        <p className="text-sm text-violet-200/85">Play games and earn prizes</p>
        <p className="text-xs text-fintech-muted">≈ {gpcToUsdDisplay(gpayCoins)} value</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/dashboard/games"
            className="rounded-xl bg-[#A855F7] px-4 py-2.5 text-sm font-bold text-white hover:opacity-95"
          >
            PLAY GAMES
          </Link>
          <button
            type="button"
            onClick={() => {
              setShowRedeem(true);
              setRedeemStep(1);
              setRedeemErr(null);
              setRedeemOk(null);
            }}
            className="rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-200"
          >
            REDEEM FOR $GPAY
          </button>
        </div>
      </section>

      {/* SECTION 3 — $GPAY Tokens */}
      <section id="redeem" className="rounded-xl border border-[#10B981]/45 bg-[#0a1a16]/90 p-6 space-y-3">
        <h2 className={`${cinzel.className} text-lg text-[#10B981]`}>⬡ $GPAY Tokens</h2>
        <p className="text-3xl font-bold tabular-nums text-[#10B981]">
          {coinsLoading ? "…" : gpayTokens.toLocaleString()} $GPAY
        </p>
        <p className="text-sm text-emerald-200/85">
          {gpayUsd != null ? `≈ $${gpayUsd.toFixed(4)} USD per token (DexScreener)` : "Live price: configure GPAY_TOKEN_MINT"}
        </p>
        <p className="text-xs text-fintech-muted">Trade on Raydium for real cash (USDC)</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              setShowRedeem(true);
              setRedeemStep(1);
            }}
            className="rounded-xl border border-[#10B981]/60 px-4 py-2.5 text-sm font-semibold text-emerald-100"
          >
            WITHDRAW TO WALLET
          </button>
          <a
            href="https://raydium.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-bold text-black"
          >
            TRADE ON RAYDIUM
          </a>
        </div>
      </section>

      {/* USD wallet (legacy top-up) */}
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6 space-y-3">
        <h2 className="text-lg font-bold text-white">USD wallet (Stripe)</h2>
        <p className="text-fintech-muted text-sm">
          Add USD for eligible withdrawals and services. Gold Coin game packs use the buttons above.
        </p>
        {depositError && <p className="text-red-400 text-sm">{depositError}</p>}
        <input
          type="number"
          min={MIN_WALLET_FUND_CENTS / 100}
          max={MAX_PAYMENT_CENTS / 100}
          step="0.01"
          placeholder={`Amount ($${(MIN_WALLET_FUND_CENTS / 100).toFixed(0)}+)`}
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3 text-white mb-2"
        />
        <button
          type="button"
          onClick={handleDeposit}
          disabled={depositLoading}
          className="w-full py-3 rounded-xl bg-fintech-accent text-white font-semibold disabled:opacity-60"
        >
          {depositLoading ? "Redirecting…" : "Add USD"}
        </button>
      </div>

      {/* Ledgers */}
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
                  {c.gpay_coins !== 0 && (
                    <span className="text-violet-200">
                      GPC {c.gpay_coins >= 0 ? "+" : ""}
                      {c.gpay_coins}
                    </span>
                  )}
                </span>
                <span className="text-fintech-muted text-xs w-full sm:w-auto">
                  {new Date(c.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/dashboard/transactions" className="inline-block text-sm text-fintech-accent hover:underline">
        Full transaction history
      </Link>

      {/* Buy modal */}
      {showBuy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog">
          <div className="max-w-md w-full rounded-2xl border border-[#F5C842]/40 bg-[#0e0118] p-6 max-h-[90vh] overflow-y-auto">
            <h3 className={`${cinzel.className} text-xl text-[#F5C842] mb-4`}>Buy Gold Coins</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(GOLD_COIN_PACKAGES) as GoldCoinPackageId[]).map((id) => {
                const p = GOLD_COIN_PACKAGES[id];
                return (
                  <div
                    key={id}
                    className={`rounded-xl border p-4 ${p.bestValue ? "border-amber-400/60 bg-amber-950/20" : "border-white/10"}`}
                  >
                    {p.bestValue && (
                      <span className="text-[10px] font-bold text-amber-300">⭐ BEST VALUE</span>
                    )}
                    <p className="font-semibold text-white">{p.label}</p>
                    <p className="text-2xl font-bold text-[#F5C842] my-1">{p.gold_coins.toLocaleString()} GC</p>
                    <p className="text-sm text-fintech-muted mb-3">${(p.price_cents / 100).toFixed(2)}</p>
                    <button
                      type="button"
                      onClick={() => void buyGoldPack(id)}
                      className="w-full rounded-lg bg-[#F5C842] py-2 text-sm font-bold text-black"
                    >
                      BUY NOW
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-[11px] text-fintech-muted text-center">
              Gold Coins are digital entertainment credits with no cash value. Secure payment via Stripe. 🔒
            </p>
            <button
              type="button"
              className="mt-4 w-full py-2 text-sm text-violet-300"
              onClick={() => setShowBuy(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Convert modal */}
      {showConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-md w-full rounded-2xl border border-[#A855F7]/40 bg-[#0e0118] p-6">
            <h3 className={`${cinzel.className} text-xl text-[#F5C842] mb-2`}>Convert Gold Coins</h3>
            <label className="block text-sm text-fintech-muted mb-2">How many GC to convert? (min 100, steps of 100)</label>
            <input
              type="number"
              min={100}
              step={100}
              value={convertGc}
              onChange={(e) => setConvertGc(Math.max(100, Math.floor(Number(e.target.value) / 100) * 100 || 100))}
              className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-white mb-3"
            />
            <p className="text-sm text-violet-200">
              {convertGc} GC → {previewGpc} GPC
            </p>
            <p className="text-xs text-fintech-muted mb-2">
              (Your {tierLabel} rate: {(tierRate * 100).toFixed(0)}%)
            </p>
            <p className="text-sm text-white/90 mb-1">
              Gold Coins: {goldCoins.toLocaleString()} GC
            </p>
            <p className="text-sm text-emerald-300/90 mb-3">You will receive: {previewGpc} GPC</p>
            {tierRate < 1 && (
              <p className="text-xs text-amber-200/90 mb-3">
                Upgrade to Elite for 100% rate and get {(100 - Math.floor(100 * tierRate))} more GPC per 100 GC.
              </p>
            )}
            {convertErr && <p className="text-red-400 text-sm mb-2">{convertErr}</p>}
            {convertOk && <p className="text-emerald-400 text-sm mb-2">{convertOk}</p>}
            <button
              type="button"
              disabled={converting || convertGc > goldCoins || convertGc < 100}
              onClick={() => void runConvert()}
              className="w-full rounded-xl bg-[#F5C842] py-3 font-bold text-black disabled:opacity-50"
            >
              {converting ? "Converting…" : "CONVERT NOW"}
            </button>
            <button type="button" className="mt-3 w-full text-sm text-violet-300" onClick={() => setShowConvert(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Redeem modal */}
      {showRedeem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-md w-full rounded-2xl border border-emerald-500/40 bg-[#0e0118] p-6">
            <h3 className={`${cinzel.className} text-xl text-[#10B981] mb-4`}>Redeem for $GPAY Tokens</h3>
            {redeemStep === 1 && (
              <>
                <label className="block text-sm text-fintech-muted mb-2">How many GPC to redeem? (min 100)</label>
                <input
                  type="number"
                  min={100}
                  step={1}
                  value={redeemGpc}
                  onChange={(e) => setRedeemGpc(Math.max(100, Math.floor(Number(e.target.value))))}
                  className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-white mb-2"
                />
                <p className="text-sm text-emerald-200 mb-1">= {redeemGpc} $GPAY Tokens (1 GPC = 1 $GPAY)</p>
                <p className="text-xs text-fintech-muted mb-4">
                  {gpayUsd != null ? `≈ $${(redeemGpc * gpayUsd).toFixed(2)} USD at spot` : "Spot estimate unavailable"}
                </p>
                <button
                  type="button"
                  onClick={() => setRedeemStep(2)}
                  className="w-full rounded-xl bg-[#10B981] py-3 font-bold text-black"
                >
                  NEXT
                </button>
              </>
            )}
            {redeemStep === 2 && (
              <>
                <p className="text-sm text-white mb-3">Where to send $GPAY Tokens?</p>
                <button
                  type="button"
                  onClick={() => {
                    setRedeemCustodial(false);
                  }}
                  className={`w-full mb-2 rounded-lg border px-3 py-2 text-left ${!redeemCustodial ? "border-[#10B981]" : "border-white/20"}`}
                >
                  MY SOLANA WALLET — paste Phantom address
                </button>
                {!redeemCustodial && (
                  <input
                    type="text"
                    value={walletAddr}
                    onChange={(e) => setWalletAddr(e.target.value)}
                    placeholder="Wallet address"
                    className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-white text-sm mb-3"
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setRedeemCustodial(true);
                    setWalletAddr("");
                  }}
                  className={`w-full mb-3 rounded-lg border px-3 py-2 text-left ${redeemCustodial ? "border-[#10B981]" : "border-white/20"}`}
                >
                  KEEP IN GARMONPAY — we hold securely; withdraw anytime
                </button>
                {redeemErr && <p className="text-red-400 text-sm mb-2">{redeemErr}</p>}
                <button
                  type="button"
                  disabled={redeeming || (!redeemCustodial && !walletAddr.trim())}
                  onClick={() => void runRedeem()}
                  className="w-full rounded-xl bg-[#F5C842] py-3 font-bold text-black disabled:opacity-50"
                >
                  {redeeming ? "Processing…" : "REDEEM NOW"}
                </button>
              </>
            )}
            {redeemStep === 3 && redeemOk && (
              <div className="text-center space-y-2">
                <div className="text-4xl text-emerald-400">✓</div>
                <p className="text-emerald-200 font-medium">{redeemOk}</p>
                <p className="text-sm text-fintech-muted">
                  {redeemCustodial ? "Held in your account." : "Queued for transfer to your wallet."}
                </p>
              </div>
            )}
            <button
              type="button"
              className="mt-4 w-full text-sm text-violet-300"
              onClick={() => {
                setShowRedeem(false);
                setRedeemStep(1);
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
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
