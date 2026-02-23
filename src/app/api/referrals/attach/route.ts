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
  let body: { referralCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const code = typeof body.referralCode === "string" ? body.referralCode.trim().toUpperCase() : "";
  if (!code) {
    return NextResponse.json({ message: "referralCode required" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data: referrer } = await supabase
    .from("users")
    .select("id")
    .eq("referral_code", code)
    .maybeSingle();
  if (!referrer || !(referrer as { id?: string }).id) {
    return NextResponse.json({ message: "Invalid referral code" }, { status: 400 });
  }
  const referrerId = (referrer as { id: string }).id;
  if (referrerId === userId) {
    return NextResponse.json({ message: "Self-referral not allowed" }, { status: 400 });
  }
  const { error } = await supabase
    .from("users")
    .update({
      referred_by: referrerId,
      referred_by_code: code,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) {
    return NextResponse.json({ message: "Failed to attach referrer" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
