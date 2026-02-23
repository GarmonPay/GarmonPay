import { NextResponse } from "next/server";
import { findUserById, hasAdminAccess } from "@/lib/auth-store";
import { createAdminClient } from "@/lib/supabase";
import {
  listAllBanners,
  updateBannerStatus,
  deleteBanner,
  type BannerRow,
} from "@/lib/banners-db";

function isAdmin(request: Request): boolean {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return false;
  const user = findUserById(adminId);
  return !!(user && hasAdminAccess(user));
}

/** GET /api/admin/banners — list all banners with optional owner email. */
export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  try {
    const banners = await listAllBanners();
    const ownerIds = Array.from(new Set((banners as BannerRow[]).map((b) => b.owner_user_id).filter(Boolean))) as string[];
    const emails = new Map<string, string>();
    if (ownerIds.length > 0) {
      const client = createAdminClient()!;
      const { data: users } = await client.from("users").select("id, email").in("id", ownerIds);
      (users ?? []).forEach((u: { id: string; email: string }) => emails.set(u.id, u.email));
    }
    const list = (banners as BannerRow[]).map((b) => ({
      ...b,
      owner_email: b.owner_user_id ? emails.get(b.owner_user_id) ?? "—" : "—",
    }));
    return NextResponse.json({ banners: list });
  } catch (e) {
    console.error("Admin list banners error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}

/** PATCH /api/admin/banners — approve, pause, or delete. */
export async function PATCH(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: { id?: string; status?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const id = body.id;
  const status = body.status as "pending" | "active" | "paused" | undefined;
  const action = body.action;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }
  try {
    if (action === "delete") {
      await deleteBanner(id);
      return NextResponse.json({ success: true });
    }
    if (status && ["pending", "active", "paused"].includes(status)) {
      await updateBannerStatus(id, status);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ message: "status or action required" }, { status: 400 });
  } catch (e) {
    console.error("Admin banner update error:", e);
    return NextResponse.json({ message: "Failed" }, { status: 500 });
  }
}
