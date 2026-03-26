import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  let q = supabase.from("escape_room_puzzles").select("*").order("active_date", { ascending: false }).limit(200);
  if (from) q = q.gte("active_date", from);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ puzzles: data ?? [] });
}

export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const puzzle_name = typeof body.puzzle_name === "string" ? body.puzzle_name : "";
  const clue_transaction_id = typeof body.clue_transaction_id === "string" ? body.clue_transaction_id : "";
  const clue_formula = typeof body.clue_formula === "string" ? body.clue_formula : "";
  const correct_pin = typeof body.correct_pin === "string" ? body.correct_pin.replace(/\D/g, "").slice(0, 4) : "";
  const active_date = typeof body.active_date === "string" ? body.active_date.slice(0, 10) : "";
  if (!puzzle_name || !clue_transaction_id || !clue_formula || correct_pin.length !== 4 || !active_date) {
    return NextResponse.json({ error: "Missing required puzzle fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("escape_room_puzzles")
    .insert({
      puzzle_name,
      clue_transaction_id,
      clue_formula,
      clue_terminal_text: body.clue_terminal_text ?? null,
      clue_cabinet_text: body.clue_cabinet_text ?? null,
      correct_pin,
      difficulty_level: body.difficulty_level ?? "medium",
      active_date,
      is_active: body.is_active !== false,
      preview_text: body.preview_text ?? null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ puzzle: data });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  const keys = [
    "puzzle_name",
    "clue_transaction_id",
    "clue_formula",
    "clue_terminal_text",
    "clue_cabinet_text",
    "correct_pin",
    "difficulty_level",
    "active_date",
    "is_active",
    "preview_text",
  ] as const;
  for (const k of keys) {
    if (k in body) {
      let v = body[k];
      if (k === "correct_pin" && typeof v === "string") v = v.replace(/\D/g, "").slice(0, 4);
      if (k === "active_date" && typeof v === "string") v = v.slice(0, 10);
      patch[k] = v;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields" }, { status: 400 });
  }

  const { data, error } = await supabase.from("escape_room_puzzles").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ puzzle: data });
}
