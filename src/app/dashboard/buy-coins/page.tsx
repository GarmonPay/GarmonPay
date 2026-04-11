"use client";

import { useEffect, useState } from "react";
import { getSessionAsync } from "@/lib/session";
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
      <div className="rounded-xl border border-white/10 bg-fintech-bg-card p-8 text-center text-fintech-muted">
        Sign in to purchase Gold Coins.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white">Buy Gold Coins</h1>
        <p className="text-sm text-fintech-muted mt-1">
          Purchase packs with bonus Sweeps Coins — used across GarmonPay games.
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
              className={`relative rounded-2xl border p-6 flex flex-col gap-4 ${
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
              <div>
                <h2 className="text-lg font-semibold text-white">{p.name}</h2>
                <p className="text-2xl font-bold text-amber-300 mt-2">${(p.price_cents / 100).toFixed(2)}</p>
              </div>
              <p className="text-white">
                🪙 <span className="font-semibold">{p.gold_coins.toLocaleString()} GC</span>
              </p>
              <p className="text-emerald-300/90">
                ⭐ FREE Sweeps Coins:{" "}
                <span className="font-semibold">{p.bonus_sweeps_coins.toLocaleString()} SC</span>
              </p>
              {p.bonus_label && (
                <p className="text-xs text-fintech-muted uppercase tracking-wide">{p.bonus_label}</p>
              )}
              <button
                type="button"
                disabled={checkoutId === p.id}
                onClick={() => buy(p.id)}
                className="mt-auto w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 font-semibold text-black hover:opacity-95 disabled:opacity-50"
              >
                {checkoutId === p.id ? "Redirecting…" : "Buy now"}
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
        <h2 className="text-base font-semibold text-white pt-2">What are Sweeps Coins?</h2>
        <p>
          Sweeps Coins (SC) are promotional currency. Every GC purchase includes free SC as a bonus. SC can be redeemed
          for $GPAY tokens (coming soon) and is used in games like C-Lo and Coin Flip.
        </p>
        <h2 className="text-base font-semibold text-white pt-2">Free entry</h2>
        <p>You can also earn SC for free by:</p>
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
