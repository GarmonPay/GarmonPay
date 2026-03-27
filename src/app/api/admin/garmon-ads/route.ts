import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";
import { createGarmonNotification } from "@/lib/garmon-notifications";

/** GET /api/admin/garmon-ads — list garmon ads (all or pending). Query: ?status=pending */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let query = supabase
    .from("garmon_ads")
    .select("*, advertisers(business_name, user_id)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) {
    console.error("Admin garmon-ads list error:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ads: data ?? [] });
}

/** PATCH /api/admin/garmon-ads — approve or reject ad. Body: { adId, action: 'approve' | 'reject', rejectionReason?: string } */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  let body: { adId: string; action: string; rejectionReason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const { adId, action, rejectionReason } = body;
  if (!adId || !action) {
    return NextResponse.json({ message: "adId and action required" }, { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ message: "action must be approve or reject" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: adRow, error: fetchErr } = await supabase
    .from("garmon_ads")
    .select("user_id, title, remaining_budget")
    .eq("id", adId)
    .maybeSingle();
  if (fetchErr || !adRow) {
    return NextResponse.json({ message: fetchErr?.message ?? "Ad not found" }, { status: 404 });
  }
  const ownerId = (adRow as { user_id: string }).user_id;
  const adTitle = (adRow as { title?: string }).title ?? "Your ad";

  const updates: Record<string, unknown> = {
    status: action === "approve" ? "active" : "rejected",
    updated_at: new Date().toISOString(),
  };
  if (action === "reject") {
    updates.rejection_reason = rejectionReason ?? "Rejected by moderator";
  }
  if (action === "approve") {
    updates.is_active = true;
  }

  const { error } = await supabase.from("garmon_ads").update(updates).eq("id", adId);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (action === "approve") {
    const remaining = Number((adRow as { remaining_budget?: number }).remaining_budget ?? 0);
    createGarmonNotification(
      ownerId,
      "ad_approved",
      "Your ad was approved",
      remaining > 0
        ? `${adTitle.slice(0, 80)} is live and can run in the feed.`
        : `${adTitle.slice(0, 80)} is approved. Add budget from Advertise if it has not been funded yet.`
    ).catch(() => {});
  } else {
    createGarmonNotification(
      ownerId,
      "ad_rejected",
      "Ad not approved",
      (updates.rejection_reason as string) ?? "See Advertise for details."
    ).catch(() => {});
  }

  return NextResponse.json({ success: true, status: updates.status });
}
