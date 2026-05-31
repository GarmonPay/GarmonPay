import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { maskCreatorEmail } from "@/lib/coin-flip";

export async function GET(request: Request) {
  const userId = await getAuthUserIdBearerOrCookie(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: rows, error } = await admin
    .from("garmondrop_rooms")
    .select("id, created_at, entry_amount_minor, creator_id")
    .eq("status", "waiting")
    .is("opponent_id", null)
    .neq("creator_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as Array<{
    id: string;
    created_at: string;
    entry_amount_minor: number;
    creator_id: string;
  }>;

  const creatorIds = Array.from(new Set(list.map((r) => r.creator_id)));
  const profileMap = new Map<
    string,
    { email: string | null; username: string | null; full_name: string | null }
  >();
  if (creatorIds.length) {
    const { data: users } = await admin
      .from("users")
      .select("id, email, username, full_name")
      .in("id", creatorIds);
    for (const u of users ?? []) {
      const row = u as {
        id: string;
        email: string | null;
        username: string | null;
        full_name: string | null;
      };
      profileMap.set(row.id, {
        email: row.email,
        username: row.username,
        full_name: row.full_name,
      });
    }
  }

  function creatorLabelFor(cid: string): string {
    const p = profileMap.get(cid);
    const un = String(p?.username ?? "").trim();
    if (un) return un;
    const fn = String(p?.full_name ?? "").trim();
    if (fn) return fn;
    return maskCreatorEmail(p?.email ?? undefined);
  }

  const rooms = list.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    entryAmountMinor: Math.trunc(Number(r.entry_amount_minor)),
    creatorLabel: creatorLabelFor(r.creator_id),
  }));

  return NextResponse.json({ rooms });
}
