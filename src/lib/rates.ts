import { createAdminClient } from "@/lib/supabase";

const DEFAULT_CLICK_CENTS = 5;
const DEFAULT_VIEW_CENTS = 1;
const CACHE_TTL_MS = 60_000;

type CacheEntry = { click: number; view: number; at: number };
let cache: CacheEntry | null = null;

function normalizeCents(n: unknown, fallback: number): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return v;
}

async function loadRatesFromDb(): Promise<{ click: number; view: number }> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { click: DEFAULT_CLICK_CENTS, view: DEFAULT_VIEW_CENTS };
  }
  const { data, error } = await supabase
    .from("platform_settings")
    .select("click_payout_cents, view_payout_cents")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) {
    return { click: DEFAULT_CLICK_CENTS, view: DEFAULT_VIEW_CENTS };
  }
  const row = data as { click_payout_cents?: number; view_payout_cents?: number };
  return {
    click: normalizeCents(row.click_payout_cents, DEFAULT_CLICK_CENTS),
    view: normalizeCents(row.view_payout_cents, DEFAULT_VIEW_CENTS),
  };
}

/** Cached member click payout (cents) from platform_settings. Server-only. */
export async function getClickPayoutCents(): Promise<number> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.click;
  }
  const r = await loadRatesFromDb();
  cache = { click: r.click, view: r.view, at: now };
  return cache.click;
}

/** Cached member view payout (cents) from platform_settings. Server-only. */
export async function getViewPayoutCents(): Promise<number> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.view;
  }
  const r = await loadRatesFromDb();
  cache = { click: r.click, view: r.view, at: now };
  return cache.view;
}

/** Call after POST /api/admin/rates updates platform_settings. */
export function invalidateRateCache(): void {
  cache = null;
}
