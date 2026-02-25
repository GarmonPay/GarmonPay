"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-fintech-bg">
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">✓</div>
        <h1 className="text-2xl font-bold text-white mb-2">Payment successful</h1>
        <p className="text-fintech-muted mb-6">
          Thank you for your payment. Your transaction has been completed.
          {sessionId && (
            <span className="block mt-2 text-sm font-mono text-white/60">
              Session: {sessionId.slice(0, 24)}…
            </span>
          )}
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

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-fintech-muted">Loading…</div>}>
      <PaymentSuccessContent />
    </Suspense>
  );
}
