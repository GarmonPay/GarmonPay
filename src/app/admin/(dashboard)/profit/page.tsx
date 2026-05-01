"use client";

import { useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";

const API_BASE = getApiRoot();

function AdminProfitInner() {
  const session = useAdminSession();
  const [profitCents, setProfitCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
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

  return (
    <div className="p-6">
      <h1 className="font-[family-name:var(--font-admin-display)] text-xl font-bold text-white mb-2">
        Platform Profit
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-white/70">
        Net Profit = Σ platform_earnings − Σ withdrawals (cents), where payout rows use{" "}
        <code className="text-[#f5c842]/90">withdrawals.amount</code> with status approved or paid. Matches SQL spot-checks
        against <code className="text-white/80">/api/admin/stats</code>.
      </p>
      {message && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {message}
        </div>
      )}
      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : (
        <div className="max-w-md rounded-xl border border-white/10 bg-[#0e0118]/90 p-6">
          <p className="text-3xl font-bold text-emerald-400">${((profitCents ?? 0) / 100).toFixed(2)}</p>
        </div>
      )}
    </div>
  );
}

export default function AdminProfitPage() {
  return (
    <AdminPageGate>
      <AdminProfitInner />
    </AdminPageGate>
  );
}
