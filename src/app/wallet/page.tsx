"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function WalletContent() {
  const searchParams = useSearchParams();
  const funded = searchParams.get("funded") === "true";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-fintech-bg">
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 max-w-md w-full text-center">
        {funded ? (
          <>
            <div className="text-5xl mb-4">✓</div>
            <h1 className="text-2xl font-bold text-white mb-2">Funds added</h1>
            <p className="text-fintech-muted mb-6">Your wallet has been topped up successfully.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Wallet</h1>
            <p className="text-fintech-muted mb-6">Add funds from your dashboard to get started.</p>
          </>
        )}
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

export default function WalletPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-fintech-muted">Loading…</div>}>
      <WalletContent />
    </Suspense>
  );
}
