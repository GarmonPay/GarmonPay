import Link from "next/link";
import {
  GarmonLegalPageLayout,
  garmonLegalHeadingClassName,
} from "@/components/legal/GarmonLegalPageLayout";

export const metadata = {
  title: "Referral Program Terms | GarmonPay",
  description: "GarmonPay referral program terms and conditions.",
};

export default function ReferralProgramTermsPage() {
  return (
    <GarmonLegalPageLayout>
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h1
          className={`${garmonLegalHeadingClassName} text-3xl sm:text-4xl mb-2 text-[#F5C842]`}
        >
          GarmonPay Referral Program Terms
        </h1>
        <p className="text-sm text-[#c4b5fd] mb-10">Last updated: April 2026</p>

        <div className="space-y-10 text-[#e9e1f5] text-base leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-3 uppercase tracking-wide">
              1 — Overview
            </h2>
            <p>
              GarmonPay operates a one-level referral program that rewards members for introducing new
              paying members to our platform. Referral commissions are earned exclusively when referred
              members make qualifying purchases. Participation in the referral program is completely free
              and optional.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-3 uppercase tracking-wide">
              2 — Eligibility
            </h2>
            <p className="mb-3">To participate in the GarmonPay referral program you must:</p>
            <ul className="list-disc list-inside space-y-2 ml-1">
              <li>Be a registered GarmonPay member in good standing</li>
              <li>Be 18 years of age or older</li>
              <li>Reside in a jurisdiction where participation is permitted by law</li>
              <li>Not have violated GarmonPay&apos;s Terms of Service</li>
              <li>Have a verified email address</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-3 uppercase tracking-wide">
              3 — How it works
            </h2>
            <p className="mb-3">When you refer a new member to GarmonPay:</p>
            <ol className="list-decimal list-inside space-y-2 ml-1">
              <li>You share your unique referral link or code with potential members</li>
              <li>
                When they sign up using your link you receive a one time signup bonus of $0.50 credited
                to your account
              </li>
              <li>
                When your referred member purchases a paid membership you receive a one time upgrade
                commission based on their membership tier
              </li>
              <li>
                You continue to receive a monthly recurring commission for as long as your referred
                member maintains their paid membership
              </li>
            </ol>
            <p className="mt-4">
              Commissions are paid only on direct referrals. GarmonPay does not operate a multi-level or
              network marketing compensation structure. You will not receive commissions on referrals
              made by your referrals.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-3 uppercase tracking-wide">
              4 — Commission structure
            </h2>
            <div className="overflow-x-auto rounded-lg border border-[#7C3AED]/40 bg-black/20">
              <table className="w-full text-sm sm:text-base border-collapse">
                <thead>
                  <tr className="border-b border-[#7C3AED]/50 text-left">
                    <th className="p-3 font-semibold text-[#F5C842]">Event</th>
                    <th className="p-3 font-semibold text-[#F5C842]">Commission</th>
                  </tr>
                </thead>
                <tbody className="text-[#e9e1f5]">
                  <tr className="border-b border-white/10">
                    <td className="p-3">Sign up bonus</td>
                    <td className="p-3">$0.50 one time</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="p-3">Starter upgrade ($9.99/mo)</td>
                    <td className="p-3">$1.00/month</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="p-3">Growth upgrade ($24.99/mo)</td>
                    <td className="p-3">$2.50/month</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="p-3">Pro upgrade ($49.99/mo)</td>
                    <td className="p-3">$5.00/month</td>
                  </tr>
                  <tr>
                    <td className="p-3">Elite upgrade ($99.99/mo)</td>
                    <td className="p-3">$10.00/month</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-6 mb-3 font-medium text-[#F5C842]">Monthly commission limits by tier</p>
            <div className="overflow-x-auto rounded-lg border border-[#7C3AED]/40 bg-black/20">
              <table className="w-full text-sm sm:text-base border-collapse">
                <thead>
                  <tr className="border-b border-[#7C3AED]/50 text-left">
                    <th className="p-3 font-semibold text-[#F5C842]">Membership</th>
                    <th className="p-3 font-semibold text-[#F5C842]">Limit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/10">
                    <td className="p-3">Free member</td>
                    <td className="p-3">Up to $50/month</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="p-3">Starter member</td>
                    <td className="p-3">Up to $200/month</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="p-3">Growth member</td>
                    <td className="p-3">Up to $500/month</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="p-3">Pro member</td>
                    <td className="p-3">Up to $1,000/month</td>
                  </tr>
                  <tr>
                    <td className="p-3">Elite member</td>
                    <td className="p-3">Unlimited</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-3 uppercase tracking-wide">
              5 — Commission payments
            </h2>
            <p>
              Referral commissions are credited to your GarmonPay account balance within 24 hours of the
              qualifying event.
            </p>
            <p className="mt-3">
              Commissions are subject to the same withdrawal terms as other earnings including minimum
              withdrawal amounts and identity verification requirements.
            </p>
            <p className="mt-3">
              GarmonPay reserves the right to hold commissions for up to 30 days for fraud prevention
              purposes.
            </p>
            <p className="mt-3">
              Commissions will be reversed if the referred member receives a refund or their payment is
              charged back.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-3 uppercase tracking-wide">
              6 — Prohibited activities
            </h2>
            <p className="mb-3">
              The following activities will result in immediate termination of referral privileges and
              forfeiture of pending commissions:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-1">
              <li>Creating fake or duplicate accounts to generate fraudulent referrals</li>
              <li>Paying or incentivizing others to sign up without their genuine interest</li>
              <li>Misrepresenting GarmonPay&apos;s products services or earning potential</li>
              <li>Spamming referral links in unsolicited emails messages or comments</li>
              <li>Using automated systems bots or scripts to generate referrals</li>
              <li>Self-referral through secondary accounts</li>
              <li>Providing false information to obtain referral commissions</li>
              <li>Any form of deceptive marketing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-3 uppercase tracking-wide">
              7 — FTC disclosure requirement
            </h2>
            <p>
              If you promote GarmonPay on social media blogs YouTube or any public platform you MUST
              disclose your material connection.
            </p>
            <p className="mt-3 font-medium text-[#F5C842]">Required disclosure examples</p>
            <ul className="mt-2 space-y-3 list-none pl-0">
              <li>
                <span className="text-[#7C3AED] font-medium">Social media posts:</span>{" "}
                <span className="italic">
                  &quot;#ad #sponsored I earn commissions from GarmonPay referrals&quot;
                </span>
              </li>
              <li>
                <span className="text-[#7C3AED] font-medium">YouTube videos:</span> State verbally and in
                description:{" "}
                <span className="italic">
                  &quot;This video contains affiliate links. I earn a commission if you sign up.&quot;
                </span>
              </li>
              <li>
                <span className="text-[#7C3AED] font-medium">Blog posts:</span> Include clear disclosure
                at the top:{" "}
                <span className="italic">
                  &quot;Disclosure: I earn referral commissions from GarmonPay.&quot;
                </span>
              </li>
            </ul>
            <p className="mt-4">
              Failure to disclose your referral relationship violates FTC guidelines and may result in
              legal liability. GarmonPay is not responsible for members who fail to make required
              disclosures.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-3 uppercase tracking-wide">
              8 — Income disclaimer
            </h2>
            <p>
              <span className="font-semibold text-[#F5C842]">IMPORTANT:</span> Referral commissions are
              not guaranteed. The amount you earn depends entirely on your personal effort, your network
              size, and whether the people you refer choose to make purchases.
            </p>
            <p className="mt-3">
              Most GarmonPay members who participate in the referral program earn little to nothing.
              Exceptional results require exceptional effort and are not typical.
            </p>
            <p className="mt-3">
              Any income figures mentioned on the GarmonPay platform are illustrative estimates only and
              do not represent typical or guaranteed results.
            </p>
            <p className="mt-3">
              GarmonPay does not guarantee any specific level of income or commission from the referral
              program.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-3 uppercase tracking-wide">
              9 — Taxes
            </h2>
            <p>
              Referral commissions constitute taxable income. If your total earnings from GarmonPay
              including referral commissions exceed $600 in a calendar year GarmonPay will issue you a
              Form 1099-NEC and report your earnings to the Internal Revenue Service as required by law.
            </p>
            <p className="mt-3">
              You are solely responsible for reporting all earnings and paying all applicable taxes.
              GarmonPay recommends consulting a tax professional regarding your specific tax obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-3 uppercase tracking-wide">
              10 — Program changes
            </h2>
            <p>
              GarmonPay reserves the right to modify suspend or terminate the referral program at any time
              with or without notice.
            </p>
            <p className="mt-3">
              Commission rates limits and eligibility requirements may change at any time. Continued
              participation in the referral program after changes constitutes acceptance of the updated
              terms.
            </p>
            <p className="mt-3">
              Any commissions already credited to your account at the time of program termination will be
              honored subject to standard withdrawal terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#7C3AED] mb-3 uppercase tracking-wide">
              11 — Contact
            </h2>
            <p>
              Questions about the referral program:{" "}
              <a href="mailto:support@garmonpay.com" className="text-[#F5C842] underline underline-offset-2">
                support@garmonpay.com
              </a>
            </p>
          </section>
        </div>

        <nav className="mt-14 pt-8 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/" className="text-[#7C3AED] hover:text-[#F5C842] underline underline-offset-2">
            Back to home
          </Link>
          <span className="text-gray-500">·</span>
          <Link href="/terms" className="text-[#7C3AED] hover:text-[#F5C842] underline underline-offset-2">
            Terms of Service
          </Link>
          <span className="text-gray-500">·</span>
          <Link
            href="/income-disclaimer"
            className="text-[#7C3AED] hover:text-[#F5C842] underline underline-offset-2"
          >
            Income disclaimer
          </Link>
        </nav>
      </div>
    </GarmonLegalPageLayout>
  );
}
