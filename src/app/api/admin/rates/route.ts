import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { invalidateRateCache } from "@/lib/rates";

/**
 * Manual test plan (Garmon member payout rates):
 * 1. Visit /admin/platform — targets and effectives (default 5 / 1 after migration).
 * 2. Save Rates — targets update; if throttle inactive, effectives match targets.
 * 3. When throttle active, saving updates targets only; effectives follow cron/override.
 */

function parseCentsField(
  v: unknown,
  label: string
): { ok: true; value: number | undefined } | { ok: false; message: string } {
  if (v === undefined) return { ok: true, value: undefined };
  if (typeof v !== "number" || !Number.isInteger(v)) {
    return { ok: false, message: `${label} must be an integer (cents)` };
  }
  if (v < 0 || v > 100) {
    return { ok: false, message: `${label} must be between 0 and 100` };
  }
  return { ok: true, value: v };
}

function jsonRates(row: {
  click_payout_target_cents: number;
  view_payout_target_cents: number;
  click_payout_effective_cents: number;
  view_payout_effective_cents: number;
  throttle_active: boolean;
  throttle_last_run_at: string | null;
  throttle_last_margin_pct: number | null;
}) {
  return {
    click_payout_cents: row.click_payout_target_cents,
    view_payout_cents: row.view_payout_target_cents,
    click_payout_target_cents: row.click_payout_target_cents,
    view_payout_target_cents: row.view_payout_target_cents,
    click_payout_effective_cents: row.click_payout_effective_cents,
    view_payout_effective_cents: row.view_payout_effective_cents,
    throttle_active: row.throttle_active,
    throttle_last_run_at: row.throttle_last_run_at,
    throttle_last_margin_pct: row.throttle_last_margin_pct,
  };
}

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("platform_settings")
    .select(
      "click_payout_target_cents, view_payout_target_cents, click_payout_effective_cents, view_payout_effective_cents, throttle_active, throttle_last_run_at, throttle_last_margin_pct"
    )
    .limit(1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  const row = data as {
    click_payout_target_cents?: number;
    view_payout_target_cents?: number;
    click_payout_effective_cents?: number;
    view_payout_effective_cents?: number;
    throttle_active?: boolean;
    throttle_last_run_at?: string | null;
    throttle_last_margin_pct?: number | null;
  } | null;
  const clickT = Math.floor(Number(row?.click_payout_target_cents ?? 5));
  const viewT = Math.floor(Number(row?.view_payout_target_cents ?? 1));
  const clickE = Math.floor(Number(row?.click_payout_effective_cents ?? clickT));
  const viewE = Math.floor(Number(row?.view_payout_effective_cents ?? viewT));
  return NextResponse.json(
    jsonRates({
      click_payout_target_cents: clickT,
      view_payout_target_cents: viewT,
      click_payout_effective_cents: clickE,
      view_payout_effective_cents: viewE,
      throttle_active: !!row?.throttle_active,
      throttle_last_run_at: row?.throttle_last_run_at ?? null,
      throttle_last_margin_pct:
        row?.throttle_last_margin_pct === null || row?.throttle_last_margin_pct === undefined
          ? null
          : Number(row.throttle_last_margin_pct),
    })
  );
}

export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { click_payout_cents?: number; view_payout_cents?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const clickParsed = parseCentsField(body.click_payout_cents, "click_payout_cents");
  if (!clickParsed.ok) {
    return NextResponse.json({ message: clickParsed.message }, { status: 422 });
  }
  const viewParsed = parseCentsField(body.view_payout_cents, "view_payout_cents");
  if (!viewParsed.ok) {
    return NextResponse.json({ message: viewParsed.message }, { status: 422 });
  }

  if (clickParsed.value === undefined && viewParsed.value === undefined) {
    return NextResponse.json(
      { message: "Provide at least one of click_payout_cents or view_payout_cents" },
      { status: 422 }
    );
  }

  const { data: existing } = await supabase
    .from("platform_settings")
    .select(
      "id, click_payout_target_cents, view_payout_target_cents, click_payout_effective_cents, view_payout_effective_cents, throttle_active"
    )
    .limit(1)
    .maybeSingle();

  const cur = existing as {
    id?: string | number;
    click_payout_target_cents?: number;
    view_payout_target_cents?: number;
    click_payout_effective_cents?: number;
    view_payout_effective_cents?: number;
    throttle_active?: boolean;
  } | null;

  const rowId = cur?.id;
  if (rowId === undefined || rowId === null) {
    return NextResponse.json({ message: "platform_settings row missing id" }, { status: 500 });
  }

  const throttleActive = !!cur?.throttle_active;

  const nextClick =
    clickParsed.value !== undefined
      ? clickParsed.value
      : Math.floor(Number(cur?.click_payout_target_cents ?? 5));
  const nextView =
    viewParsed.value !== undefined ? viewParsed.value : Math.floor(Number(cur?.view_payout_target_cents ?? 1));

  const update: Record<string, unknown> = {
    click_payout_target_cents: nextClick,
    view_payout_target_cents: nextView,
    updated_at: new Date().toISOString(),
  };

  if (!throttleActive) {
    update.click_payout_effective_cents = nextClick;
    update.view_payout_effective_cents = nextView;
  }

  const { data: updatedRow, error } = await supabase
    .from("platform_settings")
    .update(update)
    .eq("id", rowId)
    .select(
      "click_payout_target_cents, view_payout_target_cents, click_payout_effective_cents, view_payout_effective_cents, throttle_active, throttle_last_run_at, throttle_last_margin_pct"
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  invalidateRateCache();

  const r = updatedRow as {
    click_payout_target_cents?: number;
    view_payout_target_cents?: number;
    click_payout_effective_cents?: number;
    view_payout_effective_cents?: number;
    throttle_active?: boolean;
    throttle_last_run_at?: string | null;
    throttle_last_margin_pct?: number | null;
  } | null;

  return NextResponse.json(
    jsonRates({
      click_payout_target_cents: Math.floor(Number(r?.click_payout_target_cents ?? nextClick)),
      view_payout_target_cents: Math.floor(Number(r?.view_payout_target_cents ?? nextView)),
      click_payout_effective_cents: Math.floor(
        Number(r?.click_payout_effective_cents ?? nextClick)
      ),
      view_payout_effective_cents: Math.floor(Number(r?.view_payout_effective_cents ?? nextView)),
      throttle_active: !!r?.throttle_active,
      throttle_last_run_at: r?.throttle_last_run_at ?? null,
      throttle_last_margin_pct:
        r?.throttle_last_margin_pct === null || r?.throttle_last_margin_pct === undefined
          ? null
          : Number(r.throttle_last_margin_pct),
    })
  );
}
