import { createAdminClient } from "@/lib/supabase";

const DEFAULT_CLICK_CENTS = 5;
const DEFAULT_VIEW_CENTS = 1;
const CACHE_TTL_MS = 60_000;

export type PlatformPayoutRatesRow = {
  click_effective: number;
  view_effective: number;
  click_target: number;
  view_target: number;
  throttle_active: boolean;
  throttle_last_run_at: string | null;
  throttle_last_margin_pct: number | null;
};

type CacheEntry = PlatformPayoutRatesRow & { at: number };
let cache: CacheEntry | null = null;

function normalizeCents(n: unknown, fallback: number): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return v;
}

async function loadRatesFromDb(): Promise<PlatformPayoutRatesRow> {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      click_effective: DEFAULT_CLICK_CENTS,
      view_effective: DEFAULT_VIEW_CENTS,
      click_target: DEFAULT_CLICK_CENTS,
      view_target: DEFAULT_VIEW_CENTS,
      throttle_active: false,
      throttle_last_run_at: null,
      throttle_last_margin_pct: null,
    };
  }
  const { data, error } = await supabase
    .from("platform_settings")
    .select(
      "click_payout_effective_cents, view_payout_effective_cents, click_payout_target_cents, view_payout_target_cents, throttle_active, throttle_last_run_at, throttle_last_margin_pct"
    )
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      click_effective: DEFAULT_CLICK_CENTS,
      view_effective: DEFAULT_VIEW_CENTS,
      click_target: DEFAULT_CLICK_CENTS,
      view_target: DEFAULT_VIEW_CENTS,
      throttle_active: false,
      throttle_last_run_at: null,
      throttle_last_margin_pct: null,
    };
  }
  const row = data as {
    click_payout_effective_cents?: number;
    view_payout_effective_cents?: number;
    click_payout_target_cents?: number;
    view_payout_target_cents?: number;
    throttle_active?: boolean;
    throttle_last_run_at?: string | null;
    throttle_last_margin_pct?: number | null;
  };
  const ce = normalizeCents(row.click_payout_effective_cents, DEFAULT_CLICK_CENTS);
  const ve = normalizeCents(row.view_payout_effective_cents, DEFAULT_VIEW_CENTS);
  const ct = normalizeCents(row.click_payout_target_cents, DEFAULT_CLICK_CENTS);
  const vt = normalizeCents(row.view_payout_target_cents, DEFAULT_VIEW_CENTS);
  return {
    click_effective: ce,
    view_effective: ve,
    click_target: ct,
    view_target: vt,
    throttle_active: !!row.throttle_active,
    throttle_last_run_at: row.throttle_last_run_at ?? null,
    throttle_last_margin_pct:
      row.throttle_last_margin_pct === null || row.throttle_last_margin_pct === undefined
        ? null
        : Number(row.throttle_last_margin_pct),
  };
}

async function loadCache(): Promise<CacheEntry> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache;
  }
  const r = await loadRatesFromDb();
  cache = { ...r, at: now };
  return cache;
}

/** Cached member click payout (cents) — effective rate after throttle. Server-only. */
export async function getClickPayoutCents(): Promise<number> {
  const c = await loadCache();
  return c.click_effective;
}

/** Cached member view payout (cents) — effective rate after throttle. Server-only. */
export async function getViewPayoutCents(): Promise<number> {
  const c = await loadCache();
  return c.view_effective;
}

/** Admin ceiling (cents) — same cache row. */
export async function getClickPayoutTargetCents(): Promise<number> {
  const c = await loadCache();
  return c.click_target;
}

export async function getViewPayoutTargetCents(): Promise<number> {
  const c = await loadCache();
  return c.view_target;
}

/** Full row for admin UI (single cache round-trip). */
export async function getPlatformPayoutRatesCached(): Promise<PlatformPayoutRatesRow> {
  const c = await loadCache();
  return {
    click_effective: c.click_effective,
    view_effective: c.view_effective,
    click_target: c.click_target,
    view_target: c.view_target,
    throttle_active: c.throttle_active,
    throttle_last_run_at: c.throttle_last_run_at,
    throttle_last_margin_pct: c.throttle_last_margin_pct,
  };
}

/** Call after POST /api/admin/rates, cron throttle, or override. */
export function invalidateRateCache(): void {
  cache = null;
}
