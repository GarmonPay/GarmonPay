import Link from "next/link";

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-fintech-bg text-white">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-white">Disclaimer</h1>

        <div className="space-y-6 text-gray-300 text-base leading-relaxed">
          <p>GarmonPay provides earning opportunities.</p>
          <p>We do not guarantee earnings.</p>
          <p>Results vary by user.</p>
          <p>Use the platform at your own risk.</p>
          <p>GarmonPay is not responsible for losses.</p>
        </div>

        <nav className="mt-12 pt-8 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/" className="text-fintech-accent hover:underline">Back to home</Link>
          <span className="text-gray-500">·</span>
          <Link href="/terms" className="text-fintech-accent hover:underline">Terms</Link>
          <span className="text-gray-500">·</span>
          <Link href="/privacy" className="text-fintech-accent hover:underline">Privacy</Link>
        </nav>
      </div>
    </div>
  );
}
