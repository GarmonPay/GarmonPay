import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

const ALLOWED_STATUSES = new Set(["pending", "approved", "rejected", "in_progress", "completed"]);

type SubmissionRow = {
  id: string;
  campaign_type: string;
  content_url: string;
  campaign_goal: string;
  target_audience: string;
  package_selected: string;
  contact_email: string;
  status: string;
  created_at: string;
};

/** GET /api/admin/ad-campaign-submissions */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") ?? "").trim().toLowerCase();

  let query = supabase
    .from("ad_campaign_submissions")
    .select(
      "id, campaign_type, content_url, campaign_goal, target_audience, package_selected, contact_email, status, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && ALLOWED_STATUSES.has(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ submissions: (data ?? []) as SubmissionRow[] });
}

/** PATCH /api/admin/ad-campaign-submissions with body { id, status } */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }

  const id = body.id?.trim();
  const status = body.status?.trim().toLowerCase();
  if (!id) {
    return NextResponse.json({ message: "id is required" }, { status: 400 });
  }
  if (!status || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ad_campaign_submissions")
    .update({ status })
    .eq("id", id)
    .select(
      "id, campaign_type, content_url, campaign_goal, target_audience, package_selected, contact_email, status, created_at"
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ message: "Submission not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, submission: data as SubmissionRow });
}
