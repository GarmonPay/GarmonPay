"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";

export default function Profit() {
  const [profit, setProfit] = useState(0);

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      if (!supabase) return;
      const { data } = await supabase.from("platform_revenue").select("*");
      const total = data?.reduce((a, b) => a + Number(b.amount), 0) ?? 0;
      setProfit(total);
    }
    load();
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h1>Platform Profit</h1>
      <h2>${profit}</h2>
    </div>
  );
}
