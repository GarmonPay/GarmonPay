import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-fintech-bg text-white">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-white">Terms of Service</h1>

        <div className="space-y-8 text-gray-300 text-base leading-relaxed">
          <p className="text-lg">Welcome to GarmonPay.</p>
          <p>By using our platform, you agree to the following terms.</p>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Eligibility</h2>
            <p>You must be at least 18 years old.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Accounts</h2>
            <p>You are responsible for maintaining account security.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Deposits</h2>
            <p>All deposits are processed securely via Stripe.</p>
            <p className="mt-2">Deposits are non-refundable unless required by law.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Withdrawals</h2>
            <p>Withdrawals may take 1-5 business days.</p>
          </section>

          <section id="referral-program">
            <h2 className="text-xl font-semibold text-white mb-3">Referral program</h2>
            <p>
              GarmonPay may offer a referral program with separate commission rules, eligibility, and
              disclosures. For the full referral program terms, see{" "}
              <Link href="/referral-program" className="text-fintech-accent hover:underline">
                GarmonPay Referral Program Terms
              </Link>
              .
            </p>
          </section>

          <section id="income-disclaimer">
            <h2 className="text-xl font-semibold text-white mb-3">Income disclaimer</h2>
            <p>
              Earnings are not guaranteed. For our complete income disclaimer, see{" "}
              <Link href="/income-disclaimer" className="text-fintech-accent hover:underline">
                Income Disclaimer
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Earnings (summary)</h2>
            <p>
              Income figures on the platform are illustrative only. See the{" "}
              <Link href="/income-disclaimer" className="text-fintech-accent hover:underline">
                Income Disclaimer
              </Link>{" "}
              for details.
            </p>
          </section>

          <section id="sweepstakes">
            <h2 className="text-xl font-semibold text-white mb-3">Sweepstakes rules</h2>
            <p>
              GarmonPay operates a sweepstakes entertainment platform. No purchase is necessary to
              participate in sweepstakes activities.
            </p>
            <p className="mt-4 font-semibold text-white">Free entry method</p>
            <p className="mt-2">
              To receive free Sweeps Coins without purchase send a handwritten request including your full
              name and email address to:
            </p>
            <address className="not-italic mt-2 text-gray-200">
              GarmonPay Sweepstakes
              <br />
              [Your PO Box Address]
              <br />
              Miramar, FL 33027
            </address>
            <p className="mt-3">
              Limit one free entry per household per month while supplies last. You may also use our{" "}
              <Link href="/free-entry" className="text-fintech-accent hover:underline">
                online free entry
              </Link>{" "}
              form where available.
            </p>
            <p className="mt-3">
              Gold Coins purchased with real money have no cash value and cannot be redeemed for prizes.
            </p>
            <p className="mt-3">
              Sweeps Coins are promotional credits that may be redeemed for prizes subject to verification
              and applicable law.
            </p>
            <p className="mt-3">
              Not available to residents of Washington State or any jurisdiction where sweepstakes are
              prohibited.
            </p>
            <p className="mt-3">Must be 18 or older to participate.</p>
            <p className="mt-3">Void where prohibited by law.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Prohibited activities</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Fraud</li>
              <li>Abuse</li>
              <li>Exploitation</li>
            </ul>
            <p className="mt-3">We reserve the right to suspend accounts.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Limitation of liability</h2>
            <p>Use at your own risk.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Changes</h2>
            <p>Terms may be updated anytime.</p>
          </section>
        </div>

        <nav className="mt-12 pt-8 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/" className="text-fintech-accent hover:underline">
            Back to home
          </Link>
          <span className="text-gray-500">·</span>
          <Link href="/privacy" className="text-fintech-accent hover:underline">
            Privacy
          </Link>
          <span className="text-gray-500">·</span>
          <Link href="/referral-program" className="text-fintech-accent hover:underline">
            Referral program terms
          </Link>
          <span className="text-gray-500">·</span>
          <Link href="/income-disclaimer" className="text-fintech-accent hover:underline">
            Income disclaimer
          </Link>
          <span className="text-gray-500">·</span>
          <Link href="/disclaimer" className="text-fintech-accent hover:underline">
            Disclaimer
          </Link>
        </nav>
      </div>
    </div>
  );
}
