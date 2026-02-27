import { NextResponse } from "next/server";
import {
  listAllTournaments,
  createTournament,
  updateTournament,
  endTournament,
} from "@/lib/tournament-db";
import { requireAdminAccess } from "@/lib/admin-auth";

/** GET /api/admin/tournaments — list all tournaments. */
export async function GET(request: Request) {
  const access = await requireAdminAccess(request);
  if (!access.ok) return access.response;
  try {
    const tournaments = await listAllTournaments();
    return NextResponse.json({ tournaments });
  } catch (e) {
    console.error("Admin tournaments list error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}

/** POST /api/admin/tournaments — create tournament. */
export async function POST(request: Request) {
  const access = await requireAdminAccess(request);
  if (!access.ok) return access.response;
  let body: { name?: string; entry_fee?: number; prize_pool?: number; start_date?: string; end_date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ message: "name required" }, { status: 400 });
  const entry_fee = Number(body.entry_fee ?? 0);
  const prize_pool = Number(body.prize_pool ?? 0);
  const start_date = body.start_date ?? new Date().toISOString();
  const end_date = body.end_date ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const tournament = await createTournament({ name, entry_fee, prize_pool, start_date, end_date });
    return NextResponse.json({ tournament });
  } catch (e) {
    console.error("Admin create tournament error:", e);
    return NextResponse.json({ message: "Failed to create" }, { status: 500 });
  }
}

/** PATCH /api/admin/tournaments — update tournament (body: id, name?, entry_fee?, prize_pool?, start_date?, end_date?, status?). */
export async function PATCH(request: Request) {
  const access = await requireAdminAccess(request);
  if (!access.ok) return access.response;
  let body: { id?: string; name?: string; entry_fee?: number; prize_pool?: number; start_date?: string; end_date?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const id = body.id?.trim();
  if (!id) return NextResponse.json({ message: "id required" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.entry_fee !== undefined) updates.entry_fee = body.entry_fee;
  if (body.prize_pool !== undefined) updates.prize_pool = body.prize_pool;
  if (body.start_date !== undefined) updates.start_date = body.start_date;
  if (body.end_date !== undefined) updates.end_date = body.end_date;
  if (body.status !== undefined) updates.status = body.status;
  if (Object.keys(updates).length === 0) return NextResponse.json({ message: "No updates" }, { status: 400 });
  try {
    await updateTournament(id, updates);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Admin update tournament error:", e);
    return NextResponse.json({ message: "Failed to update" }, { status: 500 });
  }
}