"use client";

import Link from "next/link";
import type { AdPackageRow } from "@/lib/ad-packages";
import {
  adPackageFeaturesToList,
  formatAdViews,
  formatPriceMonthly,
} from "@/lib/ad-packages";

export type AdPackagesCardGridProps = {
  packages: AdPackageRow[];
  loading: boolean;
  error?: string | null;
  /** Public marketing: Link CTAs. Dashboard: selectable buttons + same Supabase data. */
  variant: "marketing" | "dashboard";
  /** Dashboard: which package is highlighted */
  selectedPackageId?: string | null;
  /** Dashboard: user chose a plan — sets budget + selection in parent */
  onSelectPackage?: (pkg: AdPackageRow) => void;
  emptyMessage?: string;
};

/**
 * Shared UI for `ad_packages` rows (same fields as Supabase: name, price_monthly, ad_views, features).
 */
export function AdPackagesCardGrid({
  packages,
  loading,
  error,
  variant,
  selectedPackageId,
  onSelectPackage,
  emptyMessage = "No ad packages available",
}: AdPackagesCardGridProps) {
  if (loading) {
    return <p className="text-center text-fintech-muted">Loading packages…</p>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
        {error}
      </div>
    );
  }
  if (packages.length === 0) {
    return <p className="text-center text-lg text-fintech-muted">{emptyMessage}</p>;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {packages.map((pkg) => {
        const bullets = adPackageFeaturesToList(pkg.features);
        const monthly = formatPriceMonthly(pkg.price_monthly);
        const views = formatAdViews(pkg.ad_views);
        const isSelected = variant === "dashboard" && selectedPackageId === pkg.id;

        return (
          <div
            key={pkg.id}
            className={`flex flex-col rounded-2xl border p-6 ${
              isSelected
                ? "border-fintech-accent bg-fintech-accent/10 shadow-lg shadow-fintech-accent/15"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <h3 className="text-xl font-bold text-white">{pkg.name}</h3>
            <p className="mt-4 text-3xl font-black text-white">
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
            {variant === "marketing" ? (
              <Link
                href={`/login?next=${encodeURIComponent("/dashboard/advertise")}`}
                className="mt-6 block w-full rounded-xl bg-fintech-accent py-3 text-center text-sm font-semibold text-white hover:opacity-90"
              >
                Start Campaign
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onSelectPackage?.(pkg)}
                className="mt-6 w-full rounded-xl border border-fintech-accent/50 bg-fintech-accent/20 py-3 text-center text-sm font-semibold text-fintech-accent hover:bg-fintech-accent/30"
              >
                {isSelected ? "Selected — use in campaign" : "Select this plan"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
