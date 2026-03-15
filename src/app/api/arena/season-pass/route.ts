import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/arena/season-pass — current season pass status and perks. */
export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: row } = await supabase
    .from("arena_season_pass")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  const status = (row as { status?: string } | null)?.status ?? null;
  const currentPeriodEnd = (row as { current_period_end?: string } | null)?.current_period_end ?? null;
  const now = new Date().toISOString();
  const active = status === "active" && (!currentPeriodEnd || currentPeriodEnd > now);

  return NextResponse.json({
    active: !!active,
    status: status ?? "none",
    currentPeriodEnd: currentPeriodEnd || null,
    perks: active
      ? [
          "Double login bonus coins",
          "Extra daily spin",
          "10% store discount",
          "VIP tournament access",
          "Exclusive Season Pass title",
        ]
      : [],
  });
}
