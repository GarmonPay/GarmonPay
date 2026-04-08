"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AdPackageRow } from "@/lib/ad-packages";
import { AdPackagesCardGrid } from "@/components/advertising/AdPackagesCardGrid";
import { getSessionAsync } from "@/lib/session";

type Props = {
  heading?: string;
  subheading?: string;
  children?: ReactNode;
};

/**
 * Public ad packages from Supabase `ad_packages` via GET /api/ad-packages.
 */
export function PublicAdPackagesPage({
  heading = "Advertising",
  subheading = "Get Seen. Get Known. Get Paid.",
  children,
}: Props) {
  const searchParams = useSearchParams();
  const [packages, setPackages] = useState<AdPackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoadingPackageId, setCheckoutLoadingPackageId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ad-packages?t=${Date.now()}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data.message === "string" ? data.message : "Failed to load");
        }
        if (!cancelled) {
          setPackages(Array.isArray(data.packages) ? data.packages : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load packages");
          setPackages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchParams.get("canceled") === "1") {
      setCheckoutError("Checkout was canceled. You can try again anytime.");
    }
  }, [searchParams]);

  const handleStartCampaign = async (pkg: AdPackageRow) => {
    setCheckoutError(null);
    setCheckoutLoadingPackageId(pkg.id);
    try {
      const session = await getSessionAsync();
      if (!session?.accessToken) {
        window.location.href = `/login?next=${encodeURIComponent("/advertise")}`;
        return;
      }

      const res = await fetch("/api/advertising/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        credentials: "same-origin",
        body: JSON.stringify({
          package_id: pkg.id,
          package_name: pkg.name,
          price_monthly: pkg.price_monthly,
          ad_views: pkg.ad_views,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!res.ok || !data.url) {
        throw new Error(
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "Could not start checkout. Please try again."
        );
      }

      window.location.href = data.url;
    } catch (e) {
      setCheckoutLoadingPackageId(null);
      setCheckoutError(e instanceof Error ? e.message : "Failed to create checkout session");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b1727] to-[#020617] px-4 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <Link href="/" className="text-sm text-blue-400 hover:underline">
            ← Home
          </Link>
          <h1 className="mt-4 text-4xl font-bold">{heading}</h1>
          <p className="mt-2 text-fintech-muted">{subheading}</p>
          <p className="mt-3 text-xs text-fintech-muted/80">
            Campaign packages (views + click credits, economics) load from Supabase{" "}
            <code className="text-violet-300/90">ad_packages</code>. Advertisers:{" "}
            <Link href="/dashboard/advertise" className="text-fintech-accent hover:underline">
              dashboard → Advertise
            </Link>
            .
          </p>
        </div>

        <AdPackagesCardGrid
          variant="marketing"
          packages={packages}
          loading={loading}
          error={error}
          onStartCampaign={handleStartCampaign}
          checkoutLoadingPackageId={checkoutLoadingPackageId}
        />

        {checkoutError && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
            {checkoutError}
          </div>
        )}

        {children}

        <p className="mt-10 text-center text-sm text-fintech-muted">
          Already have an account?{" "}
          <Link href="/dashboard/advertise" className="text-fintech-accent hover:underline">
            Advertiser dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
