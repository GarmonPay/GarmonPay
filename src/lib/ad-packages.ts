/** Row shape from `public.ad_packages` (Supabase). */
export type AdPackageRow = {
  id: string;
  name: string;
  price_monthly: number | string;
  ad_views: number | string;
  features: unknown;
  is_active?: boolean;
};

/** Normalize JSONB `features` to bullet strings. */
export function adPackageFeaturesToList(features: unknown): string[] {
  if (Array.isArray(features)) {
    return features.map((x) => String(x).trim()).filter(Boolean);
  }
  if (features != null && typeof features === "object" && !Array.isArray(features)) {
    return Object.values(features as Record<string, unknown>)
      .map((x) => String(x).trim())
      .filter(Boolean);
  }
  return [];
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
