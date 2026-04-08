"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";

export default function AdminEarningsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-fintech-muted">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-2">Earnings</h1>
      <p className="text-fintech-muted mb-6">Platform earnings overview. View profit and revenue by source.</p>
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6 max-w-md space-y-4">
        <p className="text-sm text-fintech-muted">Total platform profit and fight revenue are tracked on the dedicated pages.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/profit" className="inline-block px-4 py-2 rounded-lg bg-fintech-accent text-white font-medium hover:opacity-90">
            View profit
          </Link>
          <Link href="/admin/revenue" className="inline-block px-4 py-2 rounded-lg bg-fintech-accent text-white font-medium hover:opacity-90">
            View revenue
          </Link>
        </div>
      </div>
    </div>
  );
}
