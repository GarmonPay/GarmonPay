import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { authenticateAdminRequest } from "@/lib/admin-auth";

/**
 * GET /api/ads/list
 * - Default: list current user's advertiser ad submissions.
 * - scope=all (admin only): list all submissions.
 */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  const scope = new URL(request.url).searchParams.get("scope");
  if (scope === "all") {
    const auth = await authenticateAdminRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }

    const { data, error } = await supabase
      .from("ads")
      .select("id, user_id, title, description, video_url, image_url, budget, status, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    return NextResponse.json({ ads: data ?? [] });
  }

  const { data, error } = await supabase
    .from("ads")
    .select("id, user_id, title, description, video_url, image_url, budget, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ads: data ?? [] });
}
