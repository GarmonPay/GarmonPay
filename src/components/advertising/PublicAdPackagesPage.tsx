"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AdPackageRow } from "@/lib/ad-packages";
import {
  adPackageFeaturesToList,
  formatAdViews,
  formatPriceMonthly,
} from "@/lib/ad-packages";

type Props = {
  /** Page title (e.g. Advertising vs Plans) */
  heading?: string;
  subheading?: string;
  /** Extra footer content below packages */
  children?: ReactNode;
};

/**
 * Public ad packages from Supabase `ad_packages` via GET /api/ad-packages.
 * Fetch uses cache: no-store so deploys and DB changes show up immediately.
 */
export function PublicAdPackagesPage({
  heading = "Advertising",
  subheading = "Get Seen. Get Known. Get Paid.",
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
    <main className="min-h-screen bg-gradient-to-b from-[#0b1727] to-[#020617] px-4 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <Link href="/" className="text-sm text-blue-400 hover:underline">
            ← Home
          </Link>
          <h1 className="mt-4 text-4xl font-bold">{heading}</h1>
          <p className="mt-2 text-fintech-muted">{subheading}</p>
          <p className="mt-3 text-xs text-fintech-muted/80">
            Live packages from Supabase · <Link href="/advertise" className="text-fintech-accent hover:underline">/advertise</Link>
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-fintech-muted">Loading packages…</p>
        ) : packages.length === 0 ? (
          <p className="text-center text-lg text-fintech-muted">No ad packages available</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => {
              const bullets = adPackageFeaturesToList(pkg.features);
              const monthly = formatPriceMonthly(pkg.price_monthly);
              const views = formatAdViews(pkg.ad_views);
              return (
                <div
                  key={pkg.id}
                  className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                >
                  <h2 className="text-xl font-bold">{pkg.name}</h2>
                  <p className="mt-4 text-3xl font-black">
                    ${monthly}
                    <span className="text-base font-normal text-fintech-muted">/mo</span>
                  </p>
                  <p className="mt-2 text-sm text-fintech-muted">
                    <span className="font-medium text-white/90">{views}</span> ad views
                  </p>
                  {bullets.length > 0 && (
                    <ul className="mt-4 flex-1 space-y-2 text-sm text-fintech-muted">
                      {bullets.map((f) => (
                        <li key={f} className="flex gap-2">
                          <span className="text-fintech-accent">•</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href={`/login?next=${encodeURIComponent("/dashboard/advertise")}`}
                    className="mt-6 block w-full rounded-xl bg-fintech-accent py-3 text-center text-sm font-semibold text-white hover:opacity-90"
                  >
                    Start Campaign
                  </Link>
                </div>
              );
            })}
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
