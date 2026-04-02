"use client";
import type { AdPackageRow } from "@/lib/ad-packages";
import {
  parseAdPackageFeatures,
  formatAdViews,
  formatIncludedClicks,
  formatPriceMonthly,
  cpvFromPackage,
  displayAdPackageTitle,
  AD_PACKAGE_MEMBER_EARN_PER_VIEW,
  AD_PACKAGE_MEMBER_EARN_PER_CLICK,
} from "@/lib/ad-packages";

export type AdPackagesCardGridProps = {
  packages: AdPackageRow[];
  loading: boolean;
  error?: string | null;
  /** Public marketing: Link CTAs. Dashboard: selectable buttons + same Supabase data. */
  variant: "marketing" | "dashboard";
  /** Public marketing: starts ad package checkout */
  onStartCampaign?: (pkg: AdPackageRow) => void;
  /** Public marketing: package currently creating checkout session */
  checkoutLoadingPackageId?: string | null;
  /** Dashboard: which package is highlighted */
  selectedPackageId?: string | null;
  /** Dashboard: user chose a plan — sets budget + selection in parent */
  onSelectPackage?: (pkg: AdPackageRow) => void;
  emptyMessage?: string;
};

/**
 * Shared UI for `ad_packages` rows (Supabase: name, price_monthly, ad_views, features JSON).
 */
export function AdPackagesCardGrid({
  packages,
  loading,
  error,
  variant,
  onStartCampaign,
  checkoutLoadingPackageId,
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
        const meta = parseAdPackageFeatures(pkg.features);
        const bullets = meta.bullets.length > 0 ? meta.bullets : [];
        const monthly = formatPriceMonthly(pkg.price_monthly);
        const views = formatAdViews(pkg.ad_views);
        const clicks = formatIncludedClicks(pkg.included_clicks);
        const isSelected = variant === "dashboard" && selectedPackageId === pkg.id;
        const cpv = cpvFromPackage(pkg);

        return (
          <div
            key={pkg.id}
            className={`flex flex-col rounded-2xl border p-6 ${
              isSelected
                ? "border-fintech-accent bg-fintech-accent/10 shadow-lg shadow-fintech-accent/15"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <h3 className="text-xl font-bold text-white">{displayAdPackageTitle(pkg, packages)}</h3>
            <p className="mt-4 text-3xl font-black text-white">
              ${monthly}
              <span className="text-base font-normal text-fintech-muted">/campaign</span>
            </p>
            <p className="mt-2 text-sm text-violet-200/90">
              <span className="font-semibold text-[#eab308]">{views}</span> views
              <span className="text-fintech-muted"> · </span>
              <span className="font-semibold text-[#eab308]">{clicks}</span> click credits
            </p>
            <p className="mt-1 text-xs text-fintech-muted">
              Your cost per view: <span className="text-white/90">{cpv}</span>
            </p>
            {meta.est_reach && (
              <p className="mt-1 text-xs text-violet-300/90">
                Est. reach: <span className="text-white/90">{meta.est_reach}</span>
              </p>
            )}
            {meta.member_payout_usd != null && (
              <p className="mt-2 text-xs text-fintech-muted">
                Member payout pool (cap):{" "}
                <span className="text-emerald-400/90">
                  ${meta.member_payout_usd.toFixed(2)}
                </span>{" "}
                (${AD_PACKAGE_MEMBER_EARN_PER_VIEW}/view + ${AD_PACKAGE_MEMBER_EARN_PER_CLICK}/click credit)
              </p>
            )}
            {meta.advertiser_burn_ceiling_usd != null && (
              <p className="text-xs text-fintech-muted">
                Est. budget use if fully delivered:{" "}
                <span className="text-sky-300/90">
                  ${meta.advertiser_burn_ceiling_usd.toFixed(2)}
                </span>{" "}
                <span className="opacity-80">(2× member pool)</span>
              </p>
            )}
            {meta.platform_profit_usd != null && (
              <p className="text-xs text-fintech-muted">
                Est. platform margin:{" "}
                <span className="text-amber-300/90">
                  ${meta.platform_profit_usd.toFixed(2)}
                </span>
              </p>
            )}
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
              <button
                type="button"
                onClick={() => onStartCampaign?.(pkg)}
                disabled={checkoutLoadingPackageId === pkg.id}
                className="mt-6 block w-full rounded-xl bg-fintech-accent py-3 text-center text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {checkoutLoadingPackageId === pkg.id ? "Redirecting to checkout..." : "Start Campaign"}
              </button>
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
