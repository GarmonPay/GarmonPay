"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSessionAsync } from "@/lib/session";

type VerifyResult = {
  success?: boolean;
  message?: string;
  already_processed?: boolean;
  needs_advertiser_profile?: boolean;
  campaign_id?: string;
  purchase?: {
    id: string;
    package_id: string;
    amount_paid: number;
    status: string;
    ad_views: number;
  };
  package?: {
    id: string;
    name: string;
    ad_views: number;
  };
};

function AdvertiseSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = useMemo(() => searchParams.get("session_id") ?? "", [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VerifyResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sessionId) {
        setError("Missing checkout session ID.");
        setLoading(false);
        return;
      }
      try {
        const session = await getSessionAsync();
        if (!session?.accessToken) {
          window.location.href = `/login?next=${encodeURIComponent(`/advertise/success?session_id=${sessionId}`)}`;
          return;
        }

        const res = await fetch("/api/advertising/verify-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          credentials: "same-origin",
          body: JSON.stringify({ session_id: sessionId }),
        });
        const payload = (await res.json().catch(() => ({}))) as VerifyResult;
        if (!res.ok || !payload.success) {
          throw new Error(payload.message ?? "Could not verify payment.");
        }
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Verification failed.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b1727] to-[#020617] px-4 py-12 text-white">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          {loading ? (
            <>
              <h1 className="text-2xl font-bold">Verifying your payment...</h1>
              <p className="mt-3 text-sm text-fintech-muted">
                Please wait while we confirm your Stripe checkout session.
              </p>
            </>
          ) : error ? (
            <>
              <h1 className="text-2xl font-bold text-red-300">Could not confirm your purchase</h1>
              <p className="mt-3 text-sm text-red-300/90">{error}</p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <Link
                  href="/advertise"
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5"
                >
                  Back to packages
                </Link>
                <Link
                  href="/dashboard/advertise"
                  className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Go to dashboard
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="text-4xl">✓</div>
              <h1 className="mt-2 text-2xl font-bold">Campaign package confirmed</h1>
              <p className="mt-2 text-sm text-fintech-muted">
                Your Stripe payment was verified and your advertiser campaign has been created or updated.
              </p>

              <div className="mt-5 space-y-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm">
                <p>
                  <span className="text-fintech-muted">Package:</span>{" "}
                  <span className="font-semibold text-white">{data?.package?.name ?? "Ad Package"}</span>
                </p>
                <p>
                  <span className="text-fintech-muted">Views included:</span>{" "}
                  {Number(data?.purchase?.ad_views ?? data?.package?.ad_views ?? 0).toLocaleString()}
                </p>
                <p>
                  <span className="text-fintech-muted">Amount paid:</span> $
                  {Number(data?.purchase?.amount_paid ?? 0).toFixed(2)}
                </p>
                {data?.campaign_id && (
                  <p>
                    <span className="text-fintech-muted">Campaign:</span>{" "}
                    <span className="font-mono text-xs text-white/80">{data.campaign_id}</span>
                  </p>
                )}
                {data?.already_processed && (
                  <p className="text-xs text-fintech-muted">
                    This checkout session was already processed earlier.
                  </p>
                )}
              </div>

              <div className="mt-6 flex items-center justify-center gap-3">
                <Link
                  href="/dashboard/advertise"
                  className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Open advertiser dashboard
                </Link>
                <Link
                  href="/advertise"
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5"
                >
                  View all packages
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function AdvertiseSuccessPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen flex items-center justify-center text-fintech-muted">Loading…</div>}
    >
      <AdvertiseSuccessContent />
    </Suspense>
  );
}
