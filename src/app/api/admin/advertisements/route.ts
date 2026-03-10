import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import {
  listAllAdvertisements,
  createAdvertisement,
  updateAdvertisement,
  deleteAdvertisement,
  type AdPlacement,
  type AdTypeDb,
} from "@/lib/advertisements-db";

const PLACEMENTS: AdPlacement[] = ["homepage", "dashboard", "fight_arena"];
const AD_TYPES: AdTypeDb[] = ["banner", "video"];

/** Allowed target URL: https or http, basic sanity. */
function sanitizeTargetUrl(url: string | null | undefined): string | null {
  if (url == null || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/** GET: List all advertisements (admin). */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const ads = await listAllAdvertisements();
    return NextResponse.json({ ads });
  } catch (e) {
    console.error("Admin list advertisements error:", e);
    return NextResponse.json({ message: "Failed to list" }, { status: 500 });
  }
}

/** POST: Create advertisement (admin). */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const ad_type = AD_TYPES.includes(body.ad_type as AdTypeDb) ? (body.ad_type as AdTypeDb) : null;
  const placement = PLACEMENTS.includes(body.placement as AdPlacement) ? (body.placement as AdPlacement) : null;
  if (!title || !ad_type || !placement) {
    return NextResponse.json(
      { message: "title, ad_type (banner|video), and placement (homepage|dashboard|fight_arena) required" },
      { status: 400 }
    );
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const file_url = typeof body.file_url === "string" ? body.file_url.trim() || null : null;
  const target_url = sanitizeTargetUrl(body.target_url);
  const active = body.active !== false;
  try {
    const ad = await createAdvertisement({
      title,
      description,
      ad_type,
      file_url,
      target_url,
      placement,
      active,
    });
    return NextResponse.json({ ad });
  } catch (e) {
    console.error("Admin create advertisement error:", e);
    return NextResponse.json({ message: "Failed to create" }, { status: 500 });
  }
}

/** PATCH: Update advertisement (admin). */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : null;
  if (!id) return NextResponse.json({ message: "id required" }, { status: 400 });
  const updates: Parameters<typeof updateAdvertisement>[1] = {};
  if (typeof body.title === "string") updates.title = body.title.trim();
  if (typeof body.description === "string") updates.description = body.description.trim();
  if (AD_TYPES.includes(body.ad_type as AdTypeDb)) updates.ad_type = body.ad_type as AdTypeDb;
  if (typeof body.file_url === "string") updates.file_url = body.file_url.trim() || null;
  if (body.target_url !== undefined) updates.target_url = sanitizeTargetUrl(body.target_url);
  if (PLACEMENTS.includes(body.placement as AdPlacement)) updates.placement = body.placement as AdPlacement;
  if (typeof body.active === "boolean") updates.active = body.active;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: "No updates" }, { status: 400 });
  }
  try {
    const ad = await updateAdvertisement(id, updates);
    return NextResponse.json({ ad });
  } catch (e) {
    console.error("Admin update advertisement error:", e);
    return NextResponse.json({ message: "Failed to update" }, { status: 500 });
  }
}

/** DELETE: Delete advertisement (admin). Query: id= */
export async function DELETE(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ message: "id required" }, { status: 400 });
  try {
    await deleteAdvertisement(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Admin delete advertisement error:", e);
    return NextResponse.json({ message: "Failed to delete" }, { status: 500 });
  }
}
