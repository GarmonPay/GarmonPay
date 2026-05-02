import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { invalidateRateCache } from "@/lib/rates";

type OverrideBody = {
  restore_to_target?: boolean;
  force_effective_cents?: { click?: number; view?: number };
};

function parseCents(n: unknown): number | null {
  if (n === undefined) return null;
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

/** POST /api/admin/throttle/override — manual escape hatch when throttle is wrong. */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: OverrideBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const { data: settings, error: readErr } = await supabase
    .from("platform_settings")
    .select(
      "id, click_payout_target_cents, view_payout_target_cents, click_payout_effective_cents, view_payout_effective_cents"
    )
    .limit(1)
    .maybeSingle();

  if (readErr || !settings) {
    return NextResponse.json({ message: readErr?.message ?? "platform_settings missing" }, { status: 500 });
  }

  const rowId = (settings as { id?: string | number }).id;
  if (rowId === undefined || rowId === null) {
    return NextResponse.json({ message: "platform_settings row missing id" }, { status: 500 });
  }

  const cur = settings as {
    click_payout_target_cents?: number;
    view_payout_target_cents?: number;
    click_payout_effective_cents?: number;
    view_payout_effective_cents?: number;
  };

  const tgtClick = Math.floor(Number(cur.click_payout_target_cents ?? 5));
  const tgtView = Math.floor(Number(cur.view_payout_target_cents ?? 1));
  const prevClick = Math.floor(Number(cur.click_payout_effective_cents ?? tgtClick));
  const prevView = Math.floor(Number(cur.view_payout_effective_cents ?? tgtView));

  const runAt = new Date().toISOString();
  let newClick = prevClick;
  let newView = prevView;
  let notes = "";

  if (body.restore_to_target === true) {
    newClick = tgtClick;
    newView = tgtView;
    notes = "restore_to_target";
  } else if (body.force_effective_cents && typeof body.force_effective_cents === "object") {
    const fc = body.force_effective_cents.click;
    const fv = body.force_effective_cents.view;
    const pClick = parseCents(fc);
    const pView = parseCents(fv);
    if (pClick === null || pView === null) {
      return NextResponse.json(
        { message: "force_effective_cents.click and .view must be integers 0–100" },
        { status: 422 }
      );
    }
    newClick = Math.max(0, Math.min(tgtClick, pClick));
    newView = Math.max(0, Math.min(tgtView, pView));
    notes = `force_effective click=${newClick} view=${newView}`;
  } else {
    return NextResponse.json(
      { message: "Provide restore_to_target: true or force_effective_cents: { click, view }" },
      { status: 422 }
    );
  }

  const { error: upErr } = await supabase
    .from("platform_settings")
    .update({
      click_payout_effective_cents: newClick,
      view_payout_effective_cents: newView,
      throttle_active: false,
      updated_at: runAt,
    })
    .eq("id", rowId);

  if (upErr) {
    return NextResponse.json({ message: upErr.message }, { status: 500 });
  }

  await supabase.from("throttle_log").insert({
    created_at: runAt,
    observed_margin_pct: null,
    action_taken: "manual_admin_override",
    prev_click_effective: prevClick,
    new_click_effective: newClick,
    prev_view_effective: prevView,
    new_view_effective: newView,
    notes,
  });

  invalidateRateCache();

  return NextResponse.json({
    ok: true,
    click_payout_effective_cents: newClick,
    view_payout_effective_cents: newView,
    throttle_active: false,
  });
}
