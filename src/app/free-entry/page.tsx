import Link from "next/link";
import {
  GarmonLegalPageLayout,
  garmonLegalHeadingClassName,
} from "@/components/legal/GarmonLegalPageLayout";
import { FreeEntryForm } from "./FreeEntryForm";

export const metadata = {
  title: "Free Sweeps Coins Entry | GarmonPay",
  description: "Request free Sweeps Coins without purchase. No purchase necessary.",
};

export default function FreeEntryPage() {
  return (
    <GarmonLegalPageLayout>
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h1 className={`${garmonLegalHeadingClassName} text-3xl sm:text-4xl mb-2 text-[#F5C842]`}>
          Free Sweeps Coins Entry
        </h1>
        <p className="text-lg font-semibold text-white mb-8">NO PURCHASE NECESSARY</p>

        <div className="space-y-10 text-[#e9e1f5] text-base leading-relaxed">
          <p>
            You can receive free Sweeps Coins without making any purchase.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-4 uppercase tracking-wide">
              Option 1 — Online free entry
            </h2>
            <p className="mb-6">
              Complete the form below to receive 10 free Sweeps Coins credited to your account.
            </p>
            <FreeEntryForm />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-4 uppercase tracking-wide">
              Option 2 — Mail-in entry
            </h2>
            <p className="mb-3">Send a handwritten request including:</p>
            <ul className="list-disc list-inside space-y-1 ml-1 mb-4">
              <li>Your full name</li>
              <li>Your email address</li>
              <li>Your GarmonPay username</li>
            </ul>
            <p className="mb-2">Mail to:</p>
            <address className="not-italic border border-[#7C3AED]/30 rounded-lg p-4 bg-black/20 text-[#e9e1f5]">
              GarmonPay Sweepstakes
              <br />
              [Your PO Box]
              <br />
              Miramar, FL 33027
            </address>
            <p className="mt-4">
              Allow 4-6 weeks for processing. Limit one free entry per household per month while supplies
              last.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F5C842] mb-3">Important notes</h2>
            <ul className="list-disc list-inside space-y-2 ml-1">
              <li>Free Sweeps Coins have the same value as purchased Sweeps Coins</li>
              <li>No purchase gives you an advantage</li>
              <li>Free entries are subject to verification</li>
              <li>GarmonPay reserves the right to limit or discontinue free entries</li>
            </ul>
          </section>

          <p>
            Questions? Contact:{" "}
            <a href="mailto:support@garmonpay.com" className="text-[#F5C842] underline underline-offset-2">
              support@garmonpay.com
            </a>
          </p>
        </div>

        <nav className="mt-14 pt-8 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/" className="text-[#7C3AED] hover:text-[#F5C842] underline underline-offset-2">
            Back to home
          </Link>
          <span className="text-gray-500">·</span>
          <Link href="/terms#sweepstakes" className="text-[#7C3AED] hover:text-[#F5C842] underline underline-offset-2">
            Sweepstakes rules
          </Link>
        </nav>
      </div>
    </GarmonLegalPageLayout>
  );
}
