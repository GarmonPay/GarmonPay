import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getTotalStats, getWeightClass } from "@/lib/arena-achievements";

/** GET /api/arena/cpu-fighters — list catalog CPU opponents (no auth.users). Optional ?weight_class=… */
export async function GET(req: Request) {
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const weightClassFilter = searchParams.get("weight_class")?.trim();

  const { data: fighters, error } = await supabase
    .from("cpu_fighters")
    .select("id, name, style, avatar, strength, speed, stamina, defense, chin, special, difficulty")
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
