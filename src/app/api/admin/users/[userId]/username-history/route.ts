import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET — full username history for a user (admin). */
export async function GET(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { userId } = await ctx.params;
  if (!userId) {
    return NextResponse.json({ message: "userId required" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("username_history")
    .select("id, old_username, new_username, changed_at, reason, changed_by")
    .eq("user_id", userId)
    .order("changed_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[admin username-history]", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
