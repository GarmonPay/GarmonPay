"use client";

import Link from "next/link";

export default function AdminEarningsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Earnings</h1>
      <p className="text-[#9ca3af] mb-6">Platform earnings overview. View profit and revenue by source.</p>
      <div className="rounded-xl bg-[#111827] border border-white/10 p-6 max-w-md">
        <p className="text-sm text-[#9ca3af] mb-4">Total platform profit is tracked on the Profit page.</p>
        <Link href="/admin/profit" className="inline-block px-4 py-2 rounded-lg bg-[#2563eb] text-white font-medium hover:opacity-90">
          View profit
        </Link>
      </div>
    </div>
  );
}
