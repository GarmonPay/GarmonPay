"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";

export default function Profit() {
  const [profit, setProfit] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.from("platform_revenue").select("*");
      const total = data?.reduce((a, b) => a + Number(b.amount), 0) ?? 0;
      setProfit(total);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Platform Profit</h1>
      <p className="text-[#9ca3af] mb-6">Total revenue from platform fees (e.g. ad view share).</p>
      {loading ? (
        <p className="text-[#9ca3af]">Loading…</p>
      ) : (
        <div className="rounded-xl bg-[#111827] border border-white/10 p-6 max-w-md">
          <p className="text-3xl font-bold text-[#10b981]">${Number(profit).toFixed(2)}</p>
        </div>
      )}
    </div>
  );
}
