import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-black text-white py-8 px-4 sm:px-6 mt-auto border-t border-white/10">
      <div className="max-w-[800px] mx-auto">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Legal</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/terms" className="text-gray-300 hover:text-white underline underline-offset-2">
            Terms of Service
          </Link>
          <Link href="/privacy" className="text-gray-300 hover:text-white underline underline-offset-2">
            Privacy Policy
          </Link>
          <Link
            href="/income-disclaimer"
            className="text-gray-300 hover:text-white underline underline-offset-2"
          >
            Income Disclaimer
          </Link>
          <Link
            href="/referral-program"
            className="text-gray-300 hover:text-white underline underline-offset-2"
          >
            Referral Program Terms
          </Link>
          <Link
            href="/terms#sweepstakes"
            className="text-gray-300 hover:text-white underline underline-offset-2"
          >
            Sweepstakes Rules
          </Link>
          <Link href="/free-entry" className="text-gray-300 hover:text-white underline underline-offset-2">
            Free Entry
          </Link>
        </div>
        <p className="mt-8 text-center text-gray-500 text-xs leading-relaxed max-w-2xl mx-auto">
          GarmonPay is a sweepstakes entertainment platform. No purchase necessary to play. Must be 18+.
          Void where prohibited. Not available in Washington State. © 2026 GarmonPay LLC. All rights
          reserved.
        </p>
      </div>
    </footer>
  );
}
