import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/admin/unlock — clear lock and failed attempts for a user. Body: { userId }. */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const userId = body.userId;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ message: "userId required" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { error } = await admin.from("users").update({
    locked_until: null,
    failed_login_attempts: 0,
  }).eq("id", userId);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
