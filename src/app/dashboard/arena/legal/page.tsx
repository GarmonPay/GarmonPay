"use client";

import Link from "next/link";

export default function ArenaLegalPage() {
  return (
    <div className="rounded-xl bg-[#161b22] border border-white/10 p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Arena — Fair Play & Legal</h1>
        <Link href="/dashboard/arena" className="text-[#f0a500] hover:underline">Back to Arena</Link>
      </div>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">Anti-cheat & Security</h2>
        <p className="text-[#9ca3af] text-sm mb-2">
          We use rate limiting, session validation, IP logging, and activity monitoring to detect and prevent abuse. Tap actions are resolved server-side. Multiple accounts from the same device or IP may be flagged and restricted. Do not attempt to manipulate outcomes, use bots, or circumvent security measures.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">Verification</h2>
        <p className="text-[#9ca3af] text-sm">
          We may require identity or payment verification for withdrawals and high-value play. Failure to comply may result in account suspension and forfeiture of funds.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">Legal Notice</h2>
        <p className="text-[#9ca3af] text-sm">
          Arena gameplay may involve real money. You must be of legal age in your jurisdiction to participate. By playing, you agree to our Terms of Service and Privacy Policy. Winnings are subject to applicable tax laws. We reserve the right to modify rules, close accounts, or void results in case of fraud or violation of these policies.
        </p>
      </section>

      <p className="text-[#6b7280] text-xs">
        Last updated: March 2025. For support or disputes, contact the platform through the main dashboard.
      </p>
    </div>
  );
}
