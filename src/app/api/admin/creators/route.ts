import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/creators — users with creator_videos aggregates */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const creatorId = new URL(request.url).searchParams.get("creatorId")?.trim();

  if (creatorId) {
    const { data: videos, error } = await supabase
      .from("creator_videos")
      .select("*")
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    const { data: user } = await supabase
      .from("users")
      .select("id, email, username")
      .eq("id", creatorId)
      .maybeSingle();
    return NextResponse.json({ creator: user, videos: videos ?? [] });
  }

  const { data: rows, error } = await supabase
    .from("creator_videos")
    .select("creator_id, status, spent_gpc, created_at")
    .not("creator_id", "is", null);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  type Agg = {
    creator_id: string;
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    spent_gpc: number;
    last_upload_at: string;
  };

  const byCreator = new Map<string, Agg>();
  for (const row of rows ?? []) {
    const id = (row as { creator_id: string }).creator_id;
    if (!id) continue;
    let agg = byCreator.get(id);
    if (!agg) {
      agg = {
        creator_id: id,
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        spent_gpc: 0,
        last_upload_at: "",
      };
      byCreator.set(id, agg);
    }
    const status = String((row as { status?: string }).status ?? "");
    agg.total += 1;
    if (status === "pending") agg.pending += 1;
    if (status === "approved") agg.approved += 1;
    if (status === "rejected") agg.rejected += 1;
    agg.spent_gpc += Math.floor(Number((row as { spent_gpc?: number }).spent_gpc ?? 0));
    const created = String((row as { created_at?: string }).created_at ?? "");
    if (created > agg.last_upload_at) agg.last_upload_at = created;
  }

  const creatorIds = Array.from(byCreator.keys());
  const usersMap = new Map<string, { email: string | null; username: string | null }>();
  if (creatorIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email, username")
      .in("id", creatorIds);
    for (const u of users ?? []) {
      const r = u as { id: string; email: string | null; username: string | null };
      usersMap.set(r.id, { email: r.email, username: r.username });
    }
  }

  const creators = Array.from(byCreator.values())
    .map((a) => ({
      ...a,
      email: usersMap.get(a.creator_id)?.email ?? null,
      username: usersMap.get(a.creator_id)?.username ?? null,
    }))
    .sort((a, b) => b.last_upload_at.localeCompare(a.last_upload_at));

  return NextResponse.json({ creators });
}
