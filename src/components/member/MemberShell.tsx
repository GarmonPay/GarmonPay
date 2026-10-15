"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GarmonPayWordmark } from "@/components/GarmonPayWordmark";
import { MEMBER_NAV } from "@/config/member-nav";

export function MemberShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    <div className="min-h-screen bg-[#0c0618] text-white">
      <header className="sticky top-0 z-40 border-b border-amber-300/20 bg-[#0c0618]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <GarmonPayWordmark href="/member" />
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-200/80">Member</p>
        </div>
        <nav aria-label="Member" className="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 pb-3">
          {MEMBER_NAV.map((item) => {
            const active = item.href === "/member" ? pathname === "/member" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`rounded-full px-3 py-2 text-sm no-underline ${active ? "bg-amber-300 text-black" : "bg-white/5 text-violet-100"}`}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <p className="mb-6 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50" role="status">
          This workspace does not attach your signed wallet. Mainnet trading, advertising charges, deposits, withdrawals, and referral payouts stay off. Nothing on this workspace is a withdrawable balance.
        </p>
        {children}
      </main>
    </div>
  );
}
