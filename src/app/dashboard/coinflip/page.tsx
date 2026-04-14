import Link from "next/link";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export default function CoinFlipSoonPage() {
  return (
    <div className={`mx-auto max-w-md px-4 py-16 text-center ${dmSans.className}`}>
      <p className="text-4xl" aria-hidden>
        🪙
      </p>
      <h1 className="mt-4 text-2xl font-bold text-[#F5C842]">Coin Flip</h1>
      <p className="mt-3 text-violet-200/80">Coming soon.</p>
      <Link
        href="/dashboard"
        className="mt-8 inline-block rounded-xl border border-[#7C3AED]/40 px-5 py-2.5 text-sm font-medium text-violet-200 hover:bg-[#7C3AED]/15"
      >
        ← Back to Dashboard
      </Link>
    </div>
  );
}
