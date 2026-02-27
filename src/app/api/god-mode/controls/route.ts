import { NextResponse } from "next/server";
import { updateOwnerFlags } from "@/lib/god-mode-db";
import { requireSuperAdminAccess } from "@/lib/admin-auth";

/** PATCH /api/god-mode/controls — set pause_ads, pause_withdrawals, maintenance_mode. Only super admin. */
export async function PATCH(request: Request) {
  const access = await requireSuperAdminAccess(request);
  if (!access.ok) {
    return access.response;
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
