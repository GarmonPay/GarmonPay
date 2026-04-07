import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { IRS_REPORTABLE_PAYOUT_THRESHOLD_CENTS } from "@/lib/signup-compliance";

/**
 * POST /api/profile/tax-info — user certifies W-9 / tax info is on file (required once reportable payouts ≥ $600).
 */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { certify?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  if (body.certify !== true) {
    return NextResponse.json({ message: "certify: true required" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: prof, error: selErr } = await admin
    .from("profiles")
    .select("reportable_earnings_cents")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) {
    console.error("[profile/tax-info] select:", selErr);
    return NextResponse.json({ message: selErr.message }, { status: 500 });
  }

  const reportable = Number((prof as { reportable_earnings_cents?: number } | null)?.reportable_earnings_cents ?? 0);
  if (reportable < IRS_REPORTABLE_PAYOUT_THRESHOLD_CENTS) {
    return NextResponse.json(
      {
        message:
          "Tax certification is only available after your reportable payouts reach the platform threshold.",
      },
      { status: 400 },
    );
  }

  const { error: upErr } = await admin
    .from("profiles")
    .update({ tax_info_submitted_at: new Date().toISOString() })
    .eq("id", userId);

  if (upErr) {
    console.error("[profile/tax-info] update:", upErr);
    return NextResponse.json({ message: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
