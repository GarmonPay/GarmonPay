"use client";

import Link from "next/link";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default function DashboardConvertPage() {
  return (
    <div className={`mx-auto max-w-lg space-y-6 px-4 py-8 ${dmSans.className}`}>
      <h1 className="text-2xl font-bold text-[#F5C842]">Convert GC → $GPAY</h1>
      <p className="leading-relaxed text-violet-200/85">
        Purchase Gold Coin packages (many include bonus $GPAY), or open your wallet for balance tools.
      </p>
      <Link
        href="/dashboard/buy-coins"
        className="block w-full rounded-2xl py-4 text-center text-base font-bold text-black transition-opacity hover:opacity-95"
        style={{ background: "#F5C842" }}
      >
        Buy Gold Coins
      </Link>
      <Link
        href="/dashboard/wallet"
        className="block w-full rounded-2xl border border-[#7C3AED]/50 bg-[#7C3AED]/15 py-4 text-center text-base font-semibold text-violet-100 transition-colors hover:bg-[#7C3AED]/25"
      >
        Open wallet
      </Link>
    </div>
  );
}
