"use client";

import { useRouter } from "next/navigation";
import { PublicAdPackagesPage } from "@/components/advertising/PublicAdPackagesPage";

/**
 * Pricing / plans: live `ad_packages` from Supabase (replaces hardcoded PLANS).
 * Same data as /advertise — use that route for bookmarks.
 */
export default function PricingPage() {
  const router = useRouter();

  return (
    <PublicAdPackagesPage
      heading="Plans & advertising"
      subheading="Choose an ad package that fits your campaign. Data loads from Supabase."
    >
      <div className="mt-12 text-center">
        <p className="mb-3 text-sm text-fintech-muted">Not sure where to start?</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/earn/calculator")}
          className="rounded-xl border-2 border-[#f0a500] bg-transparent px-8 py-3.5 text-[15px] font-bold text-[#f0a500] hover:bg-[#f0a500]/10"
        >
          Calculate your earnings first
        </button>
      </div>
    </PublicAdPackagesPage>
  );
}
