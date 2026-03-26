import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

const ALLOWED_STATUSES = new Set(["pending", "approved", "rejected", "in_progress", "completed"]);
const CAMPAIGN_TYPES = [
  "YouTube Video Views",
  "YouTube Subscribers",
  "TikTok Video Views",
  "TikTok Followers",
  "TikTok Likes",
  "Instagram Reel Views",
  "Instagram Followers",
  "Instagram Likes",
  "Facebook Video Views",
  "Facebook Page Likes",
  "Facebook Followers",
  "GarmonPay General Ad",
] as const;

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
  const campaignType = (searchParams.get("campaign_type") ?? "").trim();
  const q = (searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 25) || 25));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("ad_campaign_submissions")
    .select(
      "id, campaign_type, content_url, campaign_goal, target_audience, package_selected, contact_email, status, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status && ALLOWED_STATUSES.has(status)) {
    query = query.eq("status", status);
  }
  if (campaignType && CAMPAIGN_TYPES.includes(campaignType as (typeof CAMPAIGN_TYPES)[number])) {
    query = query.eq("campaign_type", campaignType);
  }
  if (q) {
    const escaped = q.replace(/[%_]/g, "");
    query = query.or(
      `campaign_goal.ilike.%${escaped}%,target_audience.ilike.%${escaped}%,contact_email.ilike.%${escaped}%,package_selected.ilike.%${escaped}%`
    );
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    submissions: (data ?? []) as SubmissionRow[],
    pagination: {
      page,
      limit,
      total: count ?? 0,
      total_pages: Math.max(1, Math.ceil((count ?? 0) / limit)),
    },
    filters: {
      status: status && ALLOWED_STATUSES.has(status) ? status : "all",
      campaign_type: campaignType || "all",
      q,
    },
  });
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
