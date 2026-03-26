import { NextResponse } from "next/server";
import { isGameAdmin } from "@/lib/admin-auth";
import { listPuzzles, upsertPuzzle } from "@/lib/escape-room-db";

export async function GET(request: Request) {
  if (!(await isGameAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const puzzles = await listPuzzles(500);
    return NextResponse.json({ puzzles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load puzzles";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isGameAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const body = (await request.json()) as {
      id?: string;
      puzzle_name: string;
      clue_transaction_id: string;
      clue_formula: string;
      clue_terminal_text?: string | null;
      clue_cabinet_text?: string | null;
      correct_pin: string;
      difficulty_level: "easy" | "medium" | "hard" | "expert";
      active_date: string;
      is_active: boolean;
      preview_text?: string | null;
      adminId?: string;
    };
    const adminId = request.headers.get("x-admin-id") || body.adminId || "00000000-0000-0000-0000-000000000000";
    const puzzle = await upsertPuzzle(
      {
        id: body.id,
        puzzle_name: body.puzzle_name,
        clue_transaction_id: body.clue_transaction_id,
        clue_formula: body.clue_formula,
        clue_terminal_text: body.clue_terminal_text ?? null,
        clue_cabinet_text: body.clue_cabinet_text ?? null,
        correct_pin: body.correct_pin,
        difficulty_level: body.difficulty_level,
        active_date: body.active_date,
        is_active: !!body.is_active,
        preview_text: body.preview_text ?? null,
      },
      adminId
    );
    return NextResponse.json({ puzzle });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save puzzle";
    return NextResponse.json({ message }, { status: 400 });
  }
}
