"use client";

import {
  ALL_MEMBERSHIP_PLANS_ORDER,
  MARKETING_PLANS,
  membershipTierRank,
  type MarketingPlanId,
} from "@/lib/garmon-plan-config";
import { safeFiniteInt } from "@/lib/format-number";

function formatUsdMonthly(n: unknown) {
  const v = safeFiniteInt(n);
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Props = {
  /** Already normalized (e.g. from dashboard API). */
  currentTier: MarketingPlanId;
  onUpgradePaid: (tier: MarketingPlanId) => void;
  disabled?: boolean;
  /** Slightly tighter padding for finance page. */
  compact?: boolean;
};

/**
 * Full membership ladder: Free + paid tiers. Free is never a Stripe checkout target.
 * Paid rows below the member’s current rank are disabled; equal rank shows “Current plan”.
 */
export function MembershipPlanPicker({ currentTier, onUpgradePaid, disabled, compact }: Props) {
  const currentR = membershipTierRank(currentTier);

  return (
    <div className={`grid grid-cols-1 gap-3 ${compact ? "" : "tablet:grid-cols-2"}`}>
      {ALL_MEMBERSHIP_PLANS_ORDER.map((id) => {
        const m = MARKETING_PLANS[id];
        const rank = membershipTierRank(id);
        const isPro = id === "pro";
        const isFree = id === "free";
        const isCurrent = id === currentTier;
        const isPaid = !isFree;
        const isUpgradeTarget = isPaid && rank > currentR;
        const isLowerPaid = isPaid && rank < currentR;

        const baseInteractive =
          "btn-press min-h-touch flex flex-col items-start rounded-xl text-left font-medium transition active:scale-[0.98]";
        const padding = compact ? "px-3 py-2.5" : "px-4 py-3";
        const sizeText = compact ? "text-sm" : "";
        const priceText = compact ? "text-xs" : "text-lg";

        if (isFree) {
          return (
            <div
              key={id}
              className={`${baseInteractive} ${padding} border ${
                isCurrent
                  ? "border-emerald-500/50 bg-emerald-500/10 text-white ring-1 ring-emerald-500/25"
                  : "border-white/10 bg-white/[0.06] text-white"
              } cursor-default`}
            >
              <span className={`font-semibold ${sizeText}`}>{m.label}</span>
              <span className={`mt-0.5 ${priceText} ${isCurrent ? "text-emerald-200/95" : "text-white/85"}`}>
                {formatUsdMonthly(0)}
                <span className="text-xs font-normal opacity-80">/mo</span>
              </span>
              <span className="mt-1 text-xs text-fintech-muted">Earn and withdraw on the free tier — upgrade anytime.</span>
              {isCurrent ? (
                <span className="mt-2 text-xs font-semibold text-emerald-400/90">Your plan</span>
              ) : null}
            </div>
          );
        }

        const mutedLower = isLowerPaid || disabled;
        return (
          <button
            key={id}
            type="button"
            disabled={mutedLower || isCurrent || !isUpgradeTarget || !!disabled}
            onClick={() => {
              if (isUpgradeTarget && !disabled) onUpgradePaid(id);
            }}
            className={`${baseInteractive} ${padding} ${
              isCurrent
                ? "cursor-default border border-fintech-accent/50 bg-fintech-accent/15 text-white"
                : isUpgradeTarget && !disabled
                  ? isPro
                    ? "bg-fintech-accent ring-2 ring-[#eab308]/50 shadow-[0_0_24px_-8px_rgba(234,179,8,0.45)] text-white hover:opacity-95"
                    : id === "elite"
                      ? "bg-fintech-highlight/85 text-[#0c0618] hover:opacity-95"
                      : "bg-white/10 text-white hover:bg-white/20"
                  : "cursor-not-allowed border border-white/5 bg-white/[0.04] text-white/45 opacity-70"
            } disabled:cursor-not-allowed`}
          >
            <span className={`${sizeText} font-semibold`}>{m.label}</span>
            <span
              className={`mt-0.5 ${priceText} ${
                isPro
                  ? "text-white"
                  : id === "elite"
                    ? "text-[#0c0618]"
                    : isCurrent
                      ? "text-white"
                      : "text-white/90"
              }`}
            >
              {formatUsdMonthly(m.monthlyUsd)}
              <span className="text-xs font-normal opacity-80">/mo</span>
            </span>
            {isCurrent ? (
              <span className="mt-2 text-xs font-semibold text-fintech-accent">Your plan</span>
            ) : isLowerPaid ? (
              <span className="mt-2 text-xs text-fintech-muted">Included in your current plan</span>
            ) : isUpgradeTarget ? (
              <span className="mt-2 text-xs text-fintech-muted">Tap to upgrade via Stripe</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
