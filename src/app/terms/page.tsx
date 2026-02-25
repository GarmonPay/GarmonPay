import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-fintech-bg text-white">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-white">Terms of Service</h1>

        <div className="space-y-8 text-gray-300 text-base leading-relaxed">
          <p className="text-lg">
            Welcome to GarmonPay.
          </p>
          <p>
            By using our platform, you agree to the following terms.
          </p>

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

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Earnings Disclaimer</h2>
            <p>Earnings are not guaranteed.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Prohibited Activities</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Fraud</li>
              <li>Abuse</li>
              <li>Exploitation</li>
            </ul>
            <p className="mt-3">We reserve the right to suspend accounts.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Limitation of Liability</h2>
            <p>Use at your own risk.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Changes</h2>
            <p>Terms may be updated anytime.</p>
          </section>
        </div>

        <nav className="mt-12 pt-8 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/" className="text-fintech-accent hover:underline">Back to home</Link>
          <span className="text-gray-500">·</span>
          <Link href="/privacy" className="text-fintech-accent hover:underline">Privacy</Link>
          <span className="text-gray-500">·</span>
          <Link href="/disclaimer" className="text-fintech-accent hover:underline">Disclaimer</Link>
        </nav>
      </div>
    </div>
  );
}
