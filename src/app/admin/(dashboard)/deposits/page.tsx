"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DepositRow = {
  id: string;
  user_id: string | null;
  amount: number | string | null;
  status: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatAmount(value: number | string | null) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function AdminDepositsPage() {
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDeposits() {
      const { data, error: depositsError } = await supabase
        .from("deposits")
        .select("*")
        .order("created_at", { ascending: false });

      if (depositsError) {
        setError(depositsError.message);
        setDeposits([]);
      } else {
        setDeposits((data ?? []) as DepositRow[]);
        setError(null);
      }
      setLoading(false);
    }

    loadDeposits();
  }, []);

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-white">Deposits</h1>
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111827]">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-3 text-sm font-medium text-[#9ca3af]">User ID</th>
                <th className="p-3 text-sm font-medium text-[#9ca3af]">Amount</th>
                <th className="p-3 text-sm font-medium text-[#9ca3af]">Status</th>
                <th className="p-3 text-sm font-medium text-[#9ca3af]">Created At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-4 text-[#9ca3af]" colSpan={4}>
                    Loading…
                  </td>
                </tr>
              ) : deposits.length === 0 ? (
                <tr>
                  <td className="p-4 text-[#9ca3af]" colSpan={4}>
                    No deposits found.
                  </td>
                </tr>
              ) : (
                deposits.map((deposit) => (
                  <tr key={deposit.id} className="border-b border-white/5 last:border-b-0">
                    <td className="p-3 font-mono text-[#9ca3af]">{deposit.user_id ?? "—"}</td>
                    <td className="p-3 text-white">{formatAmount(deposit.amount)}</td>
                    <td className="p-3 text-[#9ca3af]">{deposit.status ?? "—"}</td>
                    <td className="p-3 text-[#9ca3af]">{formatDate(deposit.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
