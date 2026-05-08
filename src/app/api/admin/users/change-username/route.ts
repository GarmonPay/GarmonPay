import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getAdminAuthUserId } from "@/lib/admin-auth";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";

type RpcResult = {
  success?: boolean;
  message?: string;
  new_username?: string;
};

export async function POST(req: Request) {
  const adminId = await getAdminAuthUserId(req);
  if (!adminId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let token: string | null = null;
  try {
    const cookieStore = await cookies();
    token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null;
  } catch {
    // ignore
  }
  if (!token) {
    const authHeader = req.headers.get("authorization");
    token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  }
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ message: "Server misconfigured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const b = body as { userId?: unknown; newUsername?: unknown; reason?: unknown };
  const userId = typeof b.userId === "string" ? b.userId : "";
  const newUsername = typeof b.newUsername === "string" ? b.newUsername.trim() : "";
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";

  if (!userId) {
    return NextResponse.json({ message: "userId required" }, { status: 400 });
  }
  if (!newUsername) {
    return NextResponse.json({ message: "Username required" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ message: "Reason required" }, { status: 400 });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await userClient.rpc("admin_change_username", {
    p_target_user_id: userId,
    p_new_username: newUsername,
    p_reason: reason,
  });

  if (error) {
    console.error("admin_change_username", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const row = data as RpcResult | null;
  if (!row?.success) {
    return NextResponse.json(
      { message: row?.message ?? "Username change failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, newUsername: row.new_username ?? newUsername });
}
