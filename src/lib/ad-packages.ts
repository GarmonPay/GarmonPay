/** Member-facing caps used for package economics (must stay ≤ price). */
// TODO: Optionally sync marketing copy with platform_settings click_payout_target_cents / view_payout_target_cents (admin /admin/platform).
export const AD_PACKAGE_MEMBER_EARN_PER_VIEW = 0.01;
export const AD_PACKAGE_MEMBER_EARN_PER_CLICK = 0.05;

/** Row shape from `public.ad_packages` (Supabase). */
export type AdPackageRow = {
  id: string;
  name: string;
  price_monthly: number | string;
  ad_views: number | string;
  /** Click credits included in the campaign SKU (optional on older rows). */
  included_clicks?: number | string;
  sort_order?: number | string;
  features: unknown;
  is_active?: boolean;
};

/** Official SKU ids → display name (ignores stale/wrong `name` in DB for these rows). */
const AD_PACKAGE_CANONICAL_NAME_BY_ID: Record<string, string> = {
  basic_reach: "Basic Reach",
  standard_reach: "Standard Reach",
  growth_reach: "Growth Reach",
  pro_reach: "Pro Reach",
  elite_reach: "Elite Reach",
  premium_brand: "Premium Brand",
};

/**
 * Stable card title: canonical label for known ids, else trimmed `name`, else `id`.
 * When multiple packages share the same title, use {@link displayAdPackageTitle} to disambiguate.
 */
export function resolveAdPackageBaseTitle(pkg: AdPackageRow): string {
  const id = typeof pkg.id === "string" ? pkg.id.trim() : "";
  if (id && AD_PACKAGE_CANONICAL_NAME_BY_ID[id]) return AD_PACKAGE_CANONICAL_NAME_BY_ID[id];
  const n = typeof pkg.name === "string" ? pkg.name.trim() : "";
  if (n) return n;
  return id || "Campaign";
}

export type AdPackageFeaturesMeta = {
  bullets: string[];
  member_payout_usd?: number;
  member_payout_views_usd?: number;
  member_payout_clicks_usd?: number;
  advertiser_burn_ceiling_usd?: number;
  platform_profit_usd?: number;
  cpv_to_advertiser?: number;
  cpc_pool_usd?: number;
  est_reach?: string;
};

/** Max total member pool if every view and every click credit pays out at the cap rates. */
export function memberPayoutCeilingUsd(row: { ad_views: number; included_clicks: number }): number {
  const v = Math.max(0, Math.round(Number(row.ad_views)));
  const c = Math.max(0, Math.round(Number(row.included_clicks ?? 0)));
  return (
    Math.round((v * AD_PACKAGE_MEMBER_EARN_PER_VIEW + c * AD_PACKAGE_MEMBER_EARN_PER_CLICK) * 100) / 100
  );
}

/**
 * Max dollars deducted from `remaining_budget` if every allotment pays out (engage uses 50/50:
 * advertiser charge per event = 2 × member payout).
 */
export function advertiserBurnCeilingUsd(row: { ad_views: number; included_clicks: number }): number {
  return Math.round(memberPayoutCeilingUsd(row) * 2 * 100) / 100;
}

/** Replace `features` JSON from price + delivery counts (keeps economics in sync). */
export function rebuildAdPackageFeatures(row: {
  price_monthly: number;
  ad_views: number;
  included_clicks: number;
}): Record<string, unknown> {
  const member = memberPayoutCeilingUsd(row);
  const burn = advertiserBurnCeilingUsd(row);
  const platform = Math.round((row.price_monthly - burn) * 100) / 100;
  const cpv =
    row.ad_views > 0 ? Math.round((row.price_monthly / row.ad_views) * 10000) / 10000 : 0;
  const poolClick =
    Math.round(row.included_clicks * AD_PACKAGE_MEMBER_EARN_PER_CLICK * 100) / 100;
  const poolView = Math.round(row.ad_views * AD_PACKAGE_MEMBER_EARN_PER_VIEW * 100) / 100;
  const viewsStr = (Number(row.ad_views) || 0).toLocaleString("en-US");
  const clicksStr = (Number(row.included_clicks) || 0).toLocaleString("en-US");
  return {
    bullets: [
      `${viewsStr} verified views + ${clicksStr} click credits`,
      `Member payout pool up to $${member.toFixed(2)} ($0.01/view + $0.05/click)`,
      `Est. ad budget use up to $${burn.toFixed(2)} if fully delivered`,
      `Platform margin ~$${platform.toFixed(2)} after delivery`,
    ],
    member_payout_usd: member,
    member_payout_views_usd: poolView,
    member_payout_clicks_usd: poolClick,
    advertiser_burn_ceiling_usd: burn,
    platform_profit_usd: platform,
    cpv_to_advertiser: cpv,
    cpc_pool_usd: poolClick,
    est_reach: `${viewsStr} views · ${clicksStr} clicks`,
  };
}

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
        member_payout_views_usd:
          typeof o.member_payout_views_usd === "number" ? o.member_payout_views_usd : undefined,
        member_payout_clicks_usd:
          typeof o.member_payout_clicks_usd === "number" ? o.member_payout_clicks_usd : undefined,
        platform_profit_usd:
          typeof o.platform_profit_usd === "number" ? o.platform_profit_usd : undefined,
        advertiser_burn_ceiling_usd:
          typeof o.advertiser_burn_ceiling_usd === "number"
            ? o.advertiser_burn_ceiling_usd
            : undefined,
        cpv_to_advertiser:
          typeof o.cpv_to_advertiser === "number" ? o.cpv_to_advertiser : undefined,
        cpc_pool_usd: typeof o.cpc_pool_usd === "number" ? o.cpc_pool_usd : undefined,
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

export function formatIncludedClicks(v: number | string | undefined): string {
  if (v === undefined || v === null) return "0";
  const n = typeof v === "string" ? parseInt(v, 10) : Math.round(Number(v));
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

/** Unique heading for grids when two rows share the same base title (e.g. duplicate "Starter" names). */
export function displayAdPackageTitle(pkg: AdPackageRow, all: AdPackageRow[]): string {
  const base = resolveAdPackageBaseTitle(pkg);
  const sameBase = all.filter((p) => resolveAdPackageBaseTitle(p) === base).length;
  if (sameBase <= 1) return base;
  const views = formatAdViews(pkg.ad_views);
  const price = formatPriceMonthly(pkg.price_monthly);
  return `${base} · ${views} views · $${price}`;
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
