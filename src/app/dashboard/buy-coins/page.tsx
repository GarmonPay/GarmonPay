"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

/** Rows from GET /api/coins/packages (`gc_packages` where is_active). Expected: Starter, Popular, Pro, Elite, VIP — prices $9.99–$249.99. */
type PackageRow = {
  id: string;
  name: string;
  price_cents: number;
  gold_coins: number;
  bonus_sweeps_coins: number;
  bonus_label: string | null;
  is_featured: boolean;
};

export default function BuyCoinsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => setToken(s?.accessToken ?? null));
  }, []);

  useEffect(() => {
    fetch("/api/coins/packages")
      .then((r) => r.json())
      .then((d: { packages?: PackageRow[] }) => {
        setPackages(Array.isArray(d.packages) ? d.packages : []);
      })
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
  }, []);

  async function buy(pkgId: string) {
    setError(null);
    setCheckoutId(pkgId);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/coins/checkout", {
        method: "POST",
        headers,
        body: JSON.stringify({ packageId: pkgId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Checkout failed");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("No checkout URL");
    } catch {
      setError("Network error");
    } finally {
      setCheckoutId(null);
    }
  }

  if (!token) {
    return (
      <div className="rounded-xl border border-white/10 bg-fintech-bg-card p-8 text-center text-fintech-muted space-y-3">
        <p>Sign in to purchase Gold Coins.</p>
        <p className="text-sm">
          Looking for subscription perks (referral rates, ad earn, withdrawals)?{" "}
          <Link href="/pricing" className="text-violet-300 font-medium hover:underline">
            See membership pricing
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white">Buy Gold Coins</h1>
        <p className="text-sm text-fintech-muted mt-1">
          Purchase packs with bonus GPay Coins — used across GarmonPay games.
        </p>
        <p className="text-sm text-violet-300/85 mt-2">
          <Link href="/pricing" className="text-[#F5C842] font-medium hover:underline">
            Membership plans
          </Link>{" "}
          are separate — higher commissions, ad rates, and perks billed monthly.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      {loading ? (
        <p className="text-fintech-muted">Loading packages…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {packages.map((p) => (
            <div
              key={p.id}
              className={`relative rounded-2xl border p-6 flex flex-col gap-5 ${
                p.is_featured
                  ? "border-violet-400/60 bg-gradient-to-b from-violet-950/40 to-fintech-bg-card shadow-[0_0_32px_rgba(139,92,246,0.25)]"
                  : "border-white/10 bg-fintech-bg-card/90"
              }`}
            >
              {p.is_featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                  Most popular
                </span>
              )}
              <div className="text-center border-b border-white/10 pb-4">
                <h2 className="text-lg font-semibold text-white">{p.name}</h2>
                <p className="text-4xl font-bold text-white mt-2 tracking-tight">
                  ${(p.price_cents / 100).toFixed(2)}
                </p>
              </div>
              <div className="space-y-3 text-center">
                <p className="text-amber-200">
                  <span className="text-2xl" aria-hidden>
                    🪙
                  </span>{" "}
                  <span className="text-xl font-bold tabular-nums text-amber-300">
                    {p.gold_coins.toLocaleString()} GC
                  </span>
                </p>
                <div className="rounded-xl border border-emerald-500/35 bg-gradient-to-br from-violet-950/50 to-emerald-950/30 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/90">
                    FREE GPay Coins
                  </p>
                  <p className="inline-block text-lg font-bold tabular-nums bg-gradient-to-r from-violet-300 to-emerald-300 bg-clip-text text-transparent">
                    +{p.bonus_sweeps_coins.toLocaleString()} GPC
                  </p>
                  {p.bonus_label && (
                    <p className="text-[10px] text-emerald-400/90 mt-1">{p.bonus_label}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={checkoutId === p.id}
                onClick={() => buy(p.id)}
                className="mt-auto w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 text-base font-bold text-black shadow-lg shadow-amber-900/20 hover:opacity-95 disabled:opacity-50"
              >
                {checkoutId === p.id ? "Redirecting…" : "Buy Now"}
              </button>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-white/10 bg-fintech-bg-card/80 p-6 space-y-4 text-sm text-fintech-muted">
        <h2 className="text-base font-semibold text-white">What are Gold Coins?</h2>
        <p>
          Gold Coins (GC) are used to play games and access premium features. Display rate: 1,000 GC ≈ $1.00 face value.
        </p>
        <h2 className="text-base font-semibold text-white pt-2">What are GPay Coins?</h2>
        <p>
          GPay Coins (GPC) are what you earn and play with on GarmonPay. Every GC purchase includes free GPC as a bonus.
          GPC connects to the $GPAY token (redeem winnings — coming soon) and powers games like C-Lo and Coin Flip. Share wins
          with <span className="text-violet-300">#GPayCoins</span>.
        </p>
        <h2 className="text-base font-semibold text-white pt-2">Free entry</h2>
        <p>You can also earn GPay Coins for free by:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Completing social tasks</li>
          <li>Referring friends</li>
          <li>Daily bonuses</li>
          <li>Requesting free entry by mail (where applicable)</li>
        </ul>
      </section>
    </div>
  );
}
