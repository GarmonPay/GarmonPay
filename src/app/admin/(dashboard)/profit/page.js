"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync } from "@/lib/admin-supabase";
import { buildAdminAuthHeaders } from "@/lib/admin-request";

export default function Profit() {
  const [session, setSession] = useState(null);
  const [profit, setProfit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/admin/earnings", {
          headers: buildAdminAuthHeaders(session),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.message || "Failed to load profit");
        }
        setProfit(Number(body?.summary?.totalProfitCents ?? 0));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load profit");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [session]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Platform Profit</h1>
      <p className="text-[#9ca3af] mb-6">Total profit from platform activity.</p>
      {error ? <p className="text-red-400 mb-4">{error}</p> : null}
      {loading ? (
        <p className="text-[#9ca3af]">Loading…</p>
      ) : (
        <div className="rounded-xl bg-[#111827] border border-white/10 p-6 max-w-md">
          <p className="text-3xl font-bold text-[#10b981]">
            ${(Number(profit) / 100).toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}
