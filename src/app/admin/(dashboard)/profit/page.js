"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders } from "@/lib/admin-supabase";

export default function Profit() {
  const [profitCents, setProfitCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const session = await getAdminSessionAsync();
      if (!session) {
        setError("Unauthorized");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/admin/dashboard", { headers: adminApiHeaders(session) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Failed to load profit");
        setLoading(false);
        return;
      }
      setProfitCents(Number(data?.totalProfit ?? 0));
      setLoading(false);
    }
    load().catch(() => {
      setError("Failed to load profit");
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Platform Profit</h1>
      <p className="text-[#9ca3af] mb-6">Total revenue from platform fees (e.g. ad view share).</p>
      {error ? (
        <p className="text-red-400">{error}</p>
      ) : null}
      {loading ? (
        <p className="text-[#9ca3af]">Loading…</p>
      ) : (
        <div className="rounded-xl bg-[#111827] border border-white/10 p-6 max-w-md">
          <p className="text-3xl font-bold text-[#10b981]">${(profitCents / 100).toFixed(2)}</p>
        </div>
      )}
    </div>
  );
}
