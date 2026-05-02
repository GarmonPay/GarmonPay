import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { invalidateRateCache } from "@/lib/rates";

/**
 * POST /api/cron/margin-throttle
 * Rolling 24h Garmon margin → adjust effective payout cents vs admin targets.
 * Auth: x-cron-secret or Authorization: Bearer (same as social-reverify).
 */

function extractCronSecret(request: Request): string {
  const authHeader = request.headers.get("authorization");
  return (
    request.headers.get("x-cron-secret") ?? (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "")
  ).trim();
}

function clampEffective(target: number, multiplier: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(target, Math.floor(target * multiplier)));
}

type MarginRow = { revenue_cents: number | string | null; payout_cents: number | string | null };

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { message: "Cron misconfigured: CRON_SECRET is not set" },
      { status: 500 }
    );
  }
  const secret = extractCronSecret(request);
  if (secret !== expected) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const runAt = new Date().toISOString();

  const { data: settings, error: settingsErr } = await supabase
    .from("platform_settings")
    .select(
      "id, click_payout_target_cents, view_payout_target_cents, click_payout_effective_cents, view_payout_effective_cents, throttle_active"
    )
    .limit(1)
    .maybeSingle();

  if (settingsErr || !settings) {
    console.error("[cron/margin-throttle] settings", settingsErr);
    return NextResponse.json({ message: settingsErr?.message ?? "platform_settings missing" }, { status: 500 });
  }

  const rowId = (settings as { id?: string | number }).id;
  if (rowId === undefined || rowId === null) {
    return NextResponse.json({ message: "platform_settings row missing id" }, { status: 500 });
  }

  const s = settings as {
    click_payout_target_cents?: number;
    view_payout_target_cents?: number;
    click_payout_effective_cents?: number;
    view_payout_effective_cents?: number;
    throttle_active?: boolean;
  };

  const tgtClick = Math.floor(Number(s.click_payout_target_cents ?? 5));
  const tgtView = Math.floor(Number(s.view_payout_target_cents ?? 1));
  let prevClick = Math.floor(Number(s.click_payout_effective_cents ?? tgtClick));
  let prevView = Math.floor(Number(s.view_payout_effective_cents ?? tgtView));

  const { data: marginData, error: marginErr } = await supabase.rpc("garmon_margin_last_24h");
  if (marginErr) {
    console.error("[cron/margin-throttle] margin rpc", marginErr);
    return NextResponse.json({ message: marginErr.message }, { status: 500 });
  }

  const marginRow = (Array.isArray(marginData) ? marginData[0] : marginData) as MarginRow | undefined;
  const revenueCents = Math.max(0, Number(marginRow?.revenue_cents ?? 0));
  const payoutCents = Math.max(0, Number(marginRow?.payout_cents ?? 0));

  if (revenueCents < 100) {
    const notes = `revenue_cents=${revenueCents} (< 100); skipped`;
    await supabase.from("platform_settings").update({
      throttle_last_run_at: runAt,
      throttle_last_margin_pct: null,
      updated_at: runAt,
    }).eq("id", rowId);

    await supabase.from("throttle_log").insert({
      created_at: runAt,
      observed_margin_pct: null,
      action_taken: "skip_insufficient_data",
      prev_click_effective: prevClick,
      new_click_effective: prevClick,
      prev_view_effective: prevView,
      new_view_effective: prevView,
      notes,
    });

    invalidateRateCache();
    return NextResponse.json({
      ok: true,
      action: "skip_insufficient_data",
      revenue_cents: revenueCents,
      notes,
    });
  }

  const marginPct = ((revenueCents - payoutCents) / revenueCents) * 100;

  let action: string;
  let newClick = prevClick;
  let newView = prevView;
  let throttleActive = !!s.throttle_active;

  if (marginPct >= 70) {
    action = "restore";
    newClick = tgtClick;
    newView = tgtView;
    throttleActive = false;
  } else if (marginPct >= 60) {
    action = "hold";
    newClick = prevClick;
    newView = prevView;
  } else if (marginPct >= 50) {
    action = "soft_throttle";
    throttleActive = true;
    newClick = clampEffective(tgtClick, 0.75);
    newView = clampEffective(tgtView, 0.75);
  } else if (marginPct >= 40) {
    action = "hard_throttle";
    throttleActive = true;
    newClick = clampEffective(tgtClick, 0.5);
    newView = clampEffective(tgtView, 0.5);
  } else {
    action = "emergency_throttle";
    throttleActive = true;
    newClick = clampEffective(tgtClick, 0.25);
    newView = clampEffective(tgtView, 0.25);
  }

  const marginRounded = Math.round(marginPct * 100) / 100;

  const { error: upErr } = await supabase
    .from("platform_settings")
    .update({
      click_payout_effective_cents: newClick,
      view_payout_effective_cents: newView,
      throttle_active: throttleActive,
      throttle_last_run_at: runAt,
      throttle_last_margin_pct: marginRounded,
      updated_at: runAt,
    })
    .eq("id", rowId);

  if (upErr) {
    console.error("[cron/margin-throttle] update", upErr);
    return NextResponse.json({ message: upErr.message }, { status: 500 });
  }

  const { error: logErr } = await supabase.from("throttle_log").insert({
    created_at: runAt,
    observed_margin_pct: marginRounded,
    action_taken: action,
    prev_click_effective: prevClick,
    new_click_effective: newClick,
    prev_view_effective: prevView,
    new_view_effective: newView,
    notes: `revenue_cents=${revenueCents} payout_cents=${payoutCents}`,
  });

  if (logErr) {
    console.error("[cron/margin-throttle] throttle_log", logErr);
  }

  invalidateRateCache();

  return NextResponse.json({
    ok: true,
    action,
    observed_margin_pct: marginRounded,
    revenue_cents: revenueCents,
    payout_cents: payoutCents,
    prev_click_effective: prevClick,
    new_click_effective: newClick,
    prev_view_effective: prevView,
    new_view_effective: newView,
    throttle_active: throttleActive,
  });
}
