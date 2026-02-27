"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface DashboardMetrics {
  totalUsers: number;
  totalDeposits: number;
  totalRevenue: number;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      const { count: totalUsers, error: usersError } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true });

      const { data: deposits, error: depositsError } = await supabase
        .from("deposits")
        .select("amount");

      if (usersError || depositsError) {
        setError(usersError?.message ?? depositsError?.message ?? "Failed to load dashboard metrics");
        setMetrics(null);
        return;
      }

      const totalDeposits = deposits?.reduce((sum, d) => sum + Number(d.amount), 0) || 0;

      setMetrics({
        totalUsers: totalUsers ?? 0,
        totalDeposits,
        totalRevenue: totalDeposits,
      });
      setError(null);
    }

    loadDashboard();
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-6 flex min-h-[40vh] items-center justify-center text-[#9ca3af]">
        Loading…
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-white">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[#111827] p-5">
          <p className="text-sm uppercase tracking-wide text-[#9ca3af]">Total Users</p>
          <p className="mt-1 text-2xl font-bold text-white">{metrics.totalUsers}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#111827] p-5">
          <p className="text-sm uppercase tracking-wide text-[#9ca3af]">Total Deposits</p>
          <p className="mt-1 text-2xl font-bold text-[#10b981]">{formatCurrency(metrics.totalDeposits)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#111827] p-5">
          <p className="text-sm uppercase tracking-wide text-[#9ca3af]">Total Revenue</p>
          <p className="mt-1 text-2xl font-bold text-[#10b981]">{formatCurrency(metrics.totalRevenue)}</p>
        </div>
      </div>
    </div>
  );
}
