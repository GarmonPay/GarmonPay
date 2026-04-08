import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { maskCreatorEmail } from "@/lib/coin-flip";

export async function GET(request: Request) {
  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: rows, error } = await supabase
    .from("coin_flip_games")
    .select("id, created_at, bet_amount_minor, creator_side, creator_id")
    .eq("status", "waiting")
    .eq("mode", "vs_player")
    .neq("creator_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as Array<{
    id: string;
    created_at: string;
    bet_amount_minor: number;
    creator_side: string;
    creator_id: string;
  }>;

  const creatorIds = Array.from(new Set(list.map((r) => r.creator_id)));
  const emailMap = new Map<string, string | null>();
  if (creatorIds.length) {
    const { data: users } = await supabase.from("users").select("id, email").in("id", creatorIds);
    for (const u of users ?? []) {
      const row = u as { id: string; email: string | null };
      emailMap.set(row.id, row.email);
    }
  }

  const games = list.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    betAmountMinor: Math.trunc(r.bet_amount_minor),
    creatorSide: r.creator_side,
    creatorLabel: maskCreatorEmail(emailMap.get(r.creator_id) ?? undefined),
  }));

  return NextResponse.json({ games });
}
