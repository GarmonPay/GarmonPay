import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** PATCH — update gamification_config row (id = 'default'). Body: { referral_reward?, spin_reward? } */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: { referral_reward?: number; spin_reward?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const updates: Record<string, number> = {};
  if (typeof body.referral_reward === "number") updates.referral_reward = body.referral_reward;
  if (typeof body.spin_reward === "number") updates.spin_reward = body.spin_reward;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: "No fields to update" }, { status: 400 });
  }
  const { error } = await supabase
    .from("gamification_config")
    .update(updates)
    .eq("id", "default");
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
