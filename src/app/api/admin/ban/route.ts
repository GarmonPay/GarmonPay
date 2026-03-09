import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/admin/ban — set user banned = true/false (body: { userId, banned: boolean, reason?: string }). */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: string; banned?: boolean; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ message: "userId required" }, { status: 400 });
  }
  const banned = body.banned === true;
  const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: user, error } = await supabase
    .from("users")
    .update({
      banned,
      banned_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, banned, banned_reason")
    .single();

  if (error || !user) {
    return NextResponse.json({ message: error?.message ?? "User not found" }, { status: 400 });
  }

  return NextResponse.json({ success: true, user: { id: user.id, banned: (user as { banned: boolean }).banned, banned_reason: (user as { banned_reason: string | null }).banned_reason } });
}
