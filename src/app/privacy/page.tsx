import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-fintech-bg text-white">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-white">Privacy Policy</h1>

        <div className="space-y-8 text-gray-300 text-base leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">We collect</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Name</li>
              <li>Email</li>
              <li>Account data</li>
            </ul>
          </section>

          <p>Payments are securely handled by Stripe.</p>

          <p>We do not sell your data.</p>

          <p>We protect your information using secure encryption.</p>

          <p>We only use data to operate GarmonPay.</p>
        </div>

        <nav className="mt-12 pt-8 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/" className="text-fintech-accent hover:underline">Back to home</Link>
          <span className="text-gray-500">·</span>
          <Link href="/terms" className="text-fintech-accent hover:underline">Terms</Link>
          <span className="text-gray-500">·</span>
          <Link href="/disclaimer" className="text-fintech-accent hover:underline">Disclaimer</Link>
        </nav>
      </div>
    </div>
  );
}
