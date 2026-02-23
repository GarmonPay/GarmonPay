import { NextResponse } from "next/server";
import { findUserById, isSuperAdmin } from "@/lib/auth-store";
import { createAdminClient } from "@/lib/supabase";
import { updateOwnerFlags } from "@/lib/god-mode-db";

async function isSuperAdminRequest(request: Request): Promise<boolean> {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return false;
  const user = findUserById(adminId);
  if (user && isSuperAdmin(user)) return true;
  const supabase = createAdminClient();
  if (supabase) {
    const { data } = await supabase.from("users").select("is_super_admin").eq("id", adminId).maybeSingle();
    if ((data as { is_super_admin?: boolean } | null)?.is_super_admin) return true;
  }
  return false;
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
