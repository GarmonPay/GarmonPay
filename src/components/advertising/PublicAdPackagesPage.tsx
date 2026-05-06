"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import type { AdPackageRow } from "@/lib/ad-packages";
import { AdPackagesCardGrid } from "@/components/advertising/AdPackagesCardGrid";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

type Props = {
  heading?: string;
  subheading?: string;
  children?: ReactNode;
};

/**
 * Public ad packages from GET /api/ad-packages.
 */
export function PublicAdPackagesPage({
  heading = "Advertising",
  subheading = "Get Seen. Get Known. Get Rewarded.",
  children,
}: Props) {
  const [packages, setPackages] = useState<AdPackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main
      className={`min-h-screen bg-fintech-bg px-4 py-12 text-fintech-text-primary ${dmSans.className}`}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-fintech-highlight underline-offset-2 hover:text-fintech-accent hover:underline"
          >
            ← Home
          </Link>
          <h1
            className={`${cinzel.className} mt-4 text-3xl font-bold sm:text-4xl md:text-5xl`}
          >
            <span className="bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent">
              {heading}
            </span>
          </h1>
          <p className="mt-2 text-base text-fintech-text-secondary sm:text-lg">{subheading}</p>
          <p className="mt-3 text-xs text-fintech-muted sm:text-sm">
            Campaign packages with views and click credits. Advertisers:{" "}
            <Link
              href="/dashboard/advertise"
              className="font-medium text-fintech-highlight underline-offset-2 hover:text-fintech-accent hover:underline"
            >
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
        />

        {children}

        <p className="mt-10 text-center text-sm text-fintech-text-secondary">
          Already have an account?{" "}
          <Link
            href="/dashboard/advertise"
            className="font-medium text-fintech-highlight underline-offset-2 hover:text-fintech-accent hover:underline"
          >
            Advertiser dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
