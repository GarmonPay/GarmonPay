"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function AdminBoxingPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getAdminSessionAsync>>>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    fetch(`${API_BASE}/admin/boxing/revenue`, {
      headers: adminApiHeaders(session),
    })
      .then((r) => (r.ok ? r.json() : { revenue: 0 }))
      .then((d) => {
        setRevenue(typeof d.revenue === "number" ? d.revenue : 0);
      })
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh] text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Boxing</h1>
      <p className="text-[#9ca3af] mb-6">
        Boxing revenue (10% of bets) and fight controls.
      </p>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">Boxing Revenue</h2>
        {loading ? (
          <p className="text-[#9ca3af]">Loading…</p>
        ) : (
          <p className="text-2xl font-bold text-[#10b981]">
            ${(revenue ?? 0).toFixed(2)}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Fight & min bet controls</h2>
        <p className="text-[#9ca3af] text-sm">
          Configure fights and minimum bet limits from Supabase (fights, bets tables) or add controls here.
        </p>
      </div>
    </div>
  );
}
