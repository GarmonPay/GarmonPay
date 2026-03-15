import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getTotalStats, getWeightClass } from "@/lib/arena-achievements";

const CPU_USER_IDS = [
  "a0000000-0000-0000-0000-000000000001",
  "a0000000-0000-0000-0000-000000000002",
  "a0000000-0000-0000-0000-000000000003",
  "a0000000-0000-0000-0000-000000000004",
  "a0000000-0000-0000-0000-000000000005",
  "a0000000-0000-0000-0000-000000000006",
];

/** GET /api/arena/cpu-fighters — list CPU fighters. Optional ?weight_class=Lightweight|Middleweight|Heavyweight|Unlimited for matchmaking. */
export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const weightClassFilter = searchParams.get("weight_class")?.trim();

  const { data: fighters, error } = await supabase
    .from("arena_fighters")
    .select("id, name, style, avatar, strength, speed, stamina, defense, chin, special")
    .in("user_id", CPU_USER_IDS)
    .order("name");
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const withClass = (fighters ?? []).map((f: Record<string, unknown>) => {
    const total = getTotalStats(f as Parameters<typeof getTotalStats>[0]);
    const weightClass = getWeightClass(total);
    return { ...f, totalStats: total, weightClass };
  });
  const filtered = weightClassFilter ? withClass.filter((f: { weightClass: string }) => f.weightClass === weightClassFilter) : withClass;

  return NextResponse.json({ fighters: filtered });
}
