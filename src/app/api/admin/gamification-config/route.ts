import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

const DEFAULTS = {
  spin_cost: 1,
  scratch_cost: 1,
  mystery_box_cost: 2,
  boxing_cost: 1,
  pinball_cost: 1,
  house_edge: 0.1,
};

type ConfigRow = {
  id: string;
  spin_cost: number;
  scratch_cost: number;
  mystery_box_cost: number;
  boxing_cost: number;
  pinball_cost: number;
  house_edge: number;
  created_at: string;
};

/** GET — return gamification config; auto-create one if table is empty. Never crashes. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { config: null, message: "Service unavailable" },
      { status: 503 }
    );
  }

  try {
    const { data: rows, error } = await supabase
      .from("gamification_config")
      .select("id, spin_cost, scratch_cost, mystery_box_cost, boxing_cost, pinball_cost, house_edge, created_at")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[gamification-config] GET select error:", error);
      return NextResponse.json({ config: null, message: error.message });
    }

    let row = (rows as ConfigRow[] | null)?.[0] ?? null;

    if (!row) {
      const { data: inserted, error: insertErr } = await supabase
        .from("gamification_config")
        .insert(DEFAULTS)
        .select("id, spin_cost, scratch_cost, mystery_box_cost, boxing_cost, pinball_cost, house_edge, created_at")
        .single();
      if (insertErr) {
        console.error("[gamification-config] GET auto-create error:", insertErr);
        return NextResponse.json({ config: null, message: insertErr.message });
      }
      row = inserted as ConfigRow;
    }

    return NextResponse.json({
      config: {
        id: row.id,
        spin_cost: Number(row.spin_cost ?? DEFAULTS.spin_cost),
        scratch_cost: Number(row.scratch_cost ?? DEFAULTS.scratch_cost),
        mystery_box_cost: Number(row.mystery_box_cost ?? DEFAULTS.mystery_box_cost),
        boxing_cost: Number(row.boxing_cost ?? DEFAULTS.boxing_cost),
        pinball_cost: Number(row.pinball_cost ?? DEFAULTS.pinball_cost),
        house_edge: Number(row.house_edge ?? DEFAULTS.house_edge),
        created_at: row.created_at,
      },
    });
  } catch (e) {
    console.error("[gamification-config] GET unexpected error:", e);
    return NextResponse.json({
      config: { ...DEFAULTS, id: null, created_at: null },
      message: e instanceof Error ? e.message : "Unexpected error",
    });
  }
}

/** PATCH — update gamification config. Body: { id?, spin_cost?, scratch_cost?, mystery_box_cost?, boxing_cost?, pinball_cost?, house_edge? } */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: {
    id?: string;
    spin_cost?: number;
    scratch_cost?: number;
    mystery_box_cost?: number;
    boxing_cost?: number;
    pinball_cost?: number;
    house_edge?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, number> = {};
  if (typeof body.spin_cost === "number") updates.spin_cost = body.spin_cost;
  if (typeof body.scratch_cost === "number") updates.scratch_cost = body.scratch_cost;
  if (typeof body.mystery_box_cost === "number") updates.mystery_box_cost = body.mystery_box_cost;
  if (typeof body.boxing_cost === "number") updates.boxing_cost = body.boxing_cost;
  if (typeof body.pinball_cost === "number") updates.pinball_cost = body.pinball_cost;
  if (typeof body.house_edge === "number") updates.house_edge = body.house_edge;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: "No fields to update" }, { status: 400 });
  }

  let targetId = body.id;
  if (!targetId) {
    const { data: rows } = await supabase
      .from("gamification_config")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1);
    targetId = (rows as { id: string }[])?.[0]?.id ?? null;
  }
  if (!targetId) {
    return NextResponse.json({ message: "No config row to update" }, { status: 404 });
  }

  const { error } = await supabase
    .from("gamification_config")
    .update(updates)
    .eq("id", targetId);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
