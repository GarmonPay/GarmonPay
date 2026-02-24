/**
 * POST /api/referrals/attach — set referred_by for current user from referral code.
 * Secure backend only. Prevents self-referral.
 */

import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let body: { referralCode?: string; referrerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const code = typeof body.referralCode === "string" ? body.referralCode.trim().toUpperCase() : "";
  const referrerIdParam = typeof body.referrerId === "string" ? body.referrerId.trim() : "";
  if (!code && !referrerIdParam) {
    return NextResponse.json({ message: "referralCode or referrerId required" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let referrerId: string;
  let referrerCode: string;
  if (referrerIdParam) {
    const { data: referrer } = await supabase
      .from("users")
      .select("id, referral_code")
      .eq("id", referrerIdParam)
      .maybeSingle();
    if (!referrer || !(referrer as { id?: string }).id) {
      return NextResponse.json({ message: "Invalid referrer" }, { status: 400 });
    }
    referrerId = (referrer as { id: string }).id;
    referrerCode = ((referrer as { referral_code?: string }).referral_code ?? "").trim().toUpperCase();
  } else {
    const { data: referrer } = await supabase
      .from("users")
      .select("id, referral_code")
      .eq("referral_code", code)
      .maybeSingle();
    if (!referrer || !(referrer as { id?: string }).id) {
      return NextResponse.json({ message: "Invalid referral code" }, { status: 400 });
    }
    referrerId = (referrer as { id: string }).id;
    referrerCode = ((referrer as { referral_code?: string }).referral_code ?? "").trim().toUpperCase();
  }
  if (referrerId === userId) {
    return NextResponse.json({ message: "Self-referral not allowed" }, { status: 400 });
  }
  const { error } = await supabase
    .from("users")
    .update({
      referred_by: referrerId,
      referred_by_code: referrerCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) {
    return NextResponse.json({ message: "Failed to attach referrer" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
