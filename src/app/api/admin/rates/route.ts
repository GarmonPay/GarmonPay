import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { invalidateRateCache } from "@/lib/rates";

/**
 * Manual test plan (Garmon member payout rates):
 * 1. Visit /admin/platform — "User Payout Rates" section with current values 5 and 1 (defaults after migration).
 * 2. Change click to 3, Save Rates — toast; refresh — still 3.
 * 3. Another account: open a test Garmon ad, click it.
 * 4. Wallet credits 3¢ (not 5¢).
 * 5. Change view to 2, view a test ad — wallet credits 2¢.
 * 6. Save click=999 — 422 "must be between 0 and 100".
 * 7. Save click=-1 — 422.
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
    .select("click_payout_cents, view_payout_cents")
    .eq("id", "default")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  const row = data as { click_payout_cents?: number; view_payout_cents?: number } | null;
  return NextResponse.json({
    click_payout_cents: Math.floor(Number(row?.click_payout_cents ?? 5)),
    view_payout_cents: Math.floor(Number(row?.view_payout_cents ?? 1)),
  });
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
    .select("click_payout_cents, view_payout_cents")
    .eq("id", "default")
    .maybeSingle();

  const cur = existing as { click_payout_cents?: number; view_payout_cents?: number } | null;
  const nextClick =
    clickParsed.value !== undefined
      ? clickParsed.value
      : Math.floor(Number(cur?.click_payout_cents ?? 5));
  const nextView =
    viewParsed.value !== undefined ? viewParsed.value : Math.floor(Number(cur?.view_payout_cents ?? 1));

  const { error } = await supabase
    .from("platform_settings")
    .update({
      click_payout_cents: nextClick,
      view_payout_cents: nextView,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  invalidateRateCache();

  return NextResponse.json({
    click_payout_cents: nextClick,
    view_payout_cents: nextView,
  });
}
