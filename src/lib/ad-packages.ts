/** Row shape from `public.ad_packages` (Supabase). */
export type AdPackageRow = {
  id: string;
  name: string;
  price_monthly: number | string;
  ad_views: number | string;
  features: unknown;
  is_active?: boolean;
};

export type AdPackageFeaturesMeta = {
  bullets: string[];
  member_payout_usd?: number;
  platform_profit_usd?: number;
  cpv_to_advertiser?: number;
  est_reach?: string;
};

/** Normalize JSONB `features` to bullet strings and optional economics. */
export function parseAdPackageFeatures(features: unknown): AdPackageFeaturesMeta {
  if (features != null && typeof features === "object" && !Array.isArray(features)) {
    const o = features as Record<string, unknown>;
    const bullets = Array.isArray(o.bullets)
      ? o.bullets.map((x) => String(x).trim()).filter(Boolean)
      : [];
    if (bullets.length > 0 || o.member_payout_usd != null) {
      return {
        bullets,
        member_payout_usd:
          typeof o.member_payout_usd === "number" ? o.member_payout_usd : undefined,
        platform_profit_usd:
          typeof o.platform_profit_usd === "number" ? o.platform_profit_usd : undefined,
        cpv_to_advertiser:
          typeof o.cpv_to_advertiser === "number" ? o.cpv_to_advertiser : undefined,
        est_reach: typeof o.est_reach === "string" ? o.est_reach : undefined,
      };
    }
  }
  if (Array.isArray(features)) {
    return { bullets: features.map((x) => String(x).trim()).filter(Boolean) };
  }
  return { bullets: [] };
}

/** Legacy: flat array bullets only. */
export function adPackageFeaturesToList(features: unknown): string[] {
  return parseAdPackageFeatures(features).bullets;
}

export function formatPriceMonthly(v: number | string): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

export function formatAdViews(v: number | string): string {
  const n = typeof v === "string" ? parseInt(v, 10) : Math.round(Number(v));
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

export function cpvFromPackage(pkg: AdPackageRow): string {
  const price = typeof pkg.price_monthly === "string" ? parseFloat(pkg.price_monthly) : pkg.price_monthly;
  const views =
    typeof pkg.ad_views === "string" ? parseInt(pkg.ad_views, 10) : Math.round(Number(pkg.ad_views));
  const meta = parseAdPackageFeatures(pkg.features);
  if (meta.cpv_to_advertiser != null && Number.isFinite(meta.cpv_to_advertiser)) {
    return `$${meta.cpv_to_advertiser.toFixed(4)} / view`;
  }
  if (!Number.isFinite(price) || !Number.isFinite(views) || views <= 0) return "—";
  return `$${(price / views).toFixed(4)} / view`;
}
