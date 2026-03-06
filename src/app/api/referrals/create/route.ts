import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createReferral } from "@/lib/viral-referral-db";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/referrals/create
 * Create viral_referral row (referrer, referred, code). Optionally grant $5 signup bonus to referred user.
 * Body: { referredUserId, referralCode, grantSignupBonus?, deviceFingerprint? }
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    let body: { referredUserId?: string; referralCode?: string; grantSignupBonus?: boolean; deviceFingerprint?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid body" }, { status: 400 });
    }

    const referredUserId = body.referredUserId?.trim();
    const referralCode = body.referralCode?.trim();
    if (!referredUserId || !referralCode) {
      return NextResponse.json({ success: false, message: "referredUserId and referralCode required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, message: "Service unavailable" }, { status: 503 });
    }

    const { data: referrerRow } = await supabase.from("users").select("referral_code").eq("id", userId).maybeSingle();
    const code = (referrerRow as { referral_code?: string } | null)?.referral_code;
    if (!code || code.toUpperCase() !== referralCode.toUpperCase()) {
      return NextResponse.json({ success: false, message: "Invalid referral code" }, { status: 400 });
    }

    const result = await createReferral({
      referrerUserId: userId,
      referredUserId,
      referralCode: code,
      grantSignupBonus: !!body.grantSignupBonus,
      referredIp: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null,
      deviceFingerprint: body.deviceFingerprint ?? null,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message ?? "Failed" }, { status: 400 });
    }
    return NextResponse.json({ success: true, referralId: result.referralId });
  } catch (e) {
    console.error("Referrals create error:", e);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
