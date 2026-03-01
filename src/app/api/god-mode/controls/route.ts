import { NextResponse } from "next/server";
import { createAdminClient, createServerClient } from "@/lib/supabase";
import { updateOwnerFlags } from "@/lib/god-mode-db";

async function isSuperAdminRequest(request: Request): Promise<boolean> {
  const adminId = request.headers.get("x-admin-id");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!bearerToken) return false;
  const userClient = createServerClient(bearerToken);
  if (!userClient) return false;
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return false;
  if (adminId && adminId !== user.id) return false;

  const adminClient = createAdminClient();
  const profileClient = adminClient ?? userClient;
  const { data } = await profileClient
    .from("users")
    .select("is_super_admin, is_banned")
    .eq("id", user.id)
    .maybeSingle();
  const row = data as { is_super_admin?: boolean; is_banned?: boolean } | null;
  return !!row?.is_super_admin && !row?.is_banned;
}

/** PATCH /api/god-mode/controls — set pause_ads, pause_withdrawals, maintenance_mode. Only super admin. */
export async function PATCH(request: Request) {
  if (!(await isSuperAdminRequest(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  let body: { pause_ads?: boolean; pause_withdrawals?: boolean; maintenance_mode?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  try {
    const flags = await updateOwnerFlags(body);
    return NextResponse.json({ flags });
  } catch (e) {
    console.error("God-mode controls error:", e);
    return NextResponse.json({ message: "Failed to update" }, { status: 500 });
  }
}
