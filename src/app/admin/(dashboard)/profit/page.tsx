"use client";

import { useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = getApiRoot();

export default function AdminProfitPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [profitCents, setProfitCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setMessage(null);
    fetch(`${API_BASE}/admin/stats`, { credentials: "include", headers: adminApiHeaders(session) })
      .then((res) => res.json())
      .then((data: { totalProfit?: number; message?: string }) => {
        const total = typeof data?.totalProfit === "number" ? data.totalProfit : 0;
        setProfitCents(total);
        if (data?.message) setMessage(data.message);
      })
      .catch(() => setProfitCents(0))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-fintech-muted">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-2">Platform Profit</h1>
      <p className="text-fintech-muted mb-6">
        Total profit from platform fees (withdrawals, ad share, etc.). From stats.
      </p>
      {message && (
        <div className="mb-4 rounded-lg border border-fintech-accent/30 bg-fintech-accent/10 px-4 py-2 text-fintech-muted text-sm">
          {message}
        </div>
      )}
      {loading ? (
        <p className="text-fintech-muted">Loading…</p>
      ) : (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6 max-w-md">
          <p className="text-3xl font-bold text-emerald-400">
            ${((profitCents ?? 0) / 100).toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}
