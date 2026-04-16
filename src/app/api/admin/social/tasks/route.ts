import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

const PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "facebook", "twitch"] as const;
const TIERS = ["free", "starter", "growth", "pro", "elite", "vip"] as const;

/**
 * POST /api/admin/social/tasks — create a social task (admin).
 * Body: title, description?, platform, task_type, reward_gpc, min_tier?, proof_required?, target_url, max_completions?, status?
 */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : null;
  const platform = typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "";
  const task_type = typeof body.task_type === "string" ? body.task_type.trim().toLowerCase() : "";
  const target_url = typeof body.target_url === "string" ? body.target_url.trim() : "";
  let min_tier = typeof body.min_tier === "string" ? body.min_tier.trim().toLowerCase() : "free";
  const proof_required = typeof body.proof_required === "boolean" ? body.proof_required : true;
  const max_completions = typeof body.max_completions === "number" ? Math.floor(body.max_completions) : 100;
  const status = typeof body.status === "string" && body.status === "paused" ? "paused" : "active";

  const reward_gpc =
    typeof body.reward_gpc === "number"
      ? Math.floor(body.reward_gpc)
      : typeof body.reward_gpc === "string"
        ? Math.floor(Number(body.reward_gpc))
        : 0;

  if (!title || !platform || !PLATFORMS.includes(platform as (typeof PLATFORMS)[number])) {
    return NextResponse.json(
      { message: `title and platform (${PLATFORMS.join(", ")}) required` },
      { status: 400 }
    );
  }
  if (!task_type) {
    return NextResponse.json({ message: "task_type required (e.g. follow, like, comment)" }, { status: 400 });
  }
  if (!target_url || !/^https?:\/\//i.test(target_url)) {
    return NextResponse.json({ message: "target_url must be a valid http(s) URL" }, { status: 400 });
  }
  if (!Number.isFinite(reward_gpc) || reward_gpc < 1 || reward_gpc > 1_000_000) {
    return NextResponse.json({ message: "reward_gpc must be between 1 and 1000000" }, { status: 400 });
  }
  if (!TIERS.includes(min_tier as (typeof TIERS)[number])) {
    min_tier = "free";
  }
  if (max_completions < 1 || max_completions > 10_000_000) {
    return NextResponse.json({ message: "max_completions invalid" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("social_tasks")
    .insert({
      title,
      description: description || null,
      platform,
      task_type,
      reward_gpc,
      min_tier,
      proof_required,
      target_url,
      max_completions,
      completions: 0,
      status,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[admin/social/tasks]", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: (data as { id: string }).id });
}
