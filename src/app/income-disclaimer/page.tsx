import Link from "next/link";
import {
  GarmonLegalPageLayout,
  garmonLegalHeadingClassName,
} from "@/components/legal/GarmonLegalPageLayout";

export const metadata = {
  title: "Income Disclaimer | GarmonPay",
  description: "GarmonPay income and earnings disclaimer.",
};

export default function IncomeDisclaimerPage() {
  return (
    <GarmonLegalPageLayout>
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h1 className={`${garmonLegalHeadingClassName} text-3xl sm:text-4xl mb-2 text-[#F5C842]`}>
          Income Disclaimer
        </h1>
        <p className="text-sm text-[#c4b5fd] mb-10">Last updated: April 2026</p>

        <div className="space-y-6 text-[#e9e1f5] text-base leading-relaxed">
          <p className="font-semibold text-[#F5C842] text-lg">IMPORTANT INCOME DISCLAIMER</p>
          <p>
            The income figures testimonials and earning estimates shown on GarmonPay including on our
            homepage calculator social media and marketing materials are for illustrative purposes only.
          </p>
          <p className="font-bold text-white tracking-wide">RESULTS ARE NOT TYPICAL.</p>
          <p className="font-bold text-white tracking-wide">RESULTS ARE NOT GUARANTEED.</p>
          <p>Individual results will vary significantly based on many factors including but not limited to:</p>
          <ul className="list-disc list-inside space-y-2 ml-1">
            <li>Time and effort invested</li>
            <li>Size and engagement of your network</li>
            <li>Geographic location</li>
            <li>Market conditions</li>
            <li>Individual skill and experience</li>
            <li>Whether referred members choose to make purchases</li>
          </ul>
          <p className="font-bold text-[#F5C842] uppercase tracking-wide">
            THE TYPICAL MEMBER EARNS LITTLE TO NOTHING FROM REFERRALS.
          </p>
          <p>
            GarmonPay is not a get-rich-quick program. Building meaningful income from any referral or earn
            program requires consistent effort over time.
          </p>
          <p>
            Any testimonials or success stories shown on our platform represent exceptional results achieved
            by a small percentage of members. These results are not typical and your experience will likely
            differ.
          </p>
          <p>
            GarmonPay makes no guarantee that you will earn any specific amount or any amount at all from
            using our platform.
          </p>
          <p>
            Earnings from watching ads completing tasks playing games and referrals are subject to
            availability platform rules and applicable terms of service.
          </p>
          <p>
            By using GarmonPay you acknowledge that you have read and understood this disclaimer and that
            you are not relying on any income projections or earning estimates in deciding to use our
            platform.
          </p>
          <p>
            For questions contact:{" "}
            <a href="mailto:support@garmonpay.com" className="text-[#F5C842] underline underline-offset-2">
              support@garmonpay.com
            </a>
          </p>
          <p className="pt-4 text-sm text-[#a78bfa]">© 2026 GarmonPay LLC</p>
        </div>

        <nav className="mt-14 pt-8 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/" className="text-[#7C3AED] hover:text-[#F5C842] underline underline-offset-2">
            Back to home
          </Link>
          <span className="text-gray-500">·</span>
          <Link href="/terms" className="text-[#7C3AED] hover:text-[#F5C842] underline underline-offset-2">
            Terms of Service
          </Link>
        </nav>
      </div>
    </GarmonLegalPageLayout>
  );
}
