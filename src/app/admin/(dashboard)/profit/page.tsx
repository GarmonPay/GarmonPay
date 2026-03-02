"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

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
    fetch(`${API_BASE}/admin/stats`, { headers: adminApiHeaders(session) })
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
      <div className="p-6 flex items-center justify-center min-h-[200px] text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Platform Profit</h1>
      <p className="text-[#9ca3af] mb-6">
        Total profit from platform fees (withdrawals, ad share, etc.). From stats.
      </p>
      {message && (
        <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-blue-200 text-sm">
          {message}
        </div>
      )}
      {loading ? (
        <p className="text-[#9ca3af]">Loading…</p>
      ) : (
        <div className="rounded-xl bg-[#111827] border border-white/10 p-6 max-w-md">
          <p className="text-3xl font-bold text-[#10b981]">
            ${((profitCents ?? 0) / 100).toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}
