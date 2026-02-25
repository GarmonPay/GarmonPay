"use client";

import Link from "next/link";

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-fintech-bg">
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">✕</div>
        <h1 className="text-2xl font-bold text-white mb-2">Payment cancelled</h1>
        <p className="text-fintech-muted mb-6">
          Your payment was not completed. You can try again anytime from your dashboard.
        </p>
        <Link
          href="/dashboard"
          className="inline-block w-full py-3 rounded-xl bg-fintech-accent text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
