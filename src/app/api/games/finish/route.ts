import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { finishEscapeSession } from "@/lib/escape-room-db";

export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    session_id?: string;
    entered_pin?: string;
    terminal_found?: boolean;
    cabinet_found?: boolean;
    keypad_solved?: boolean;
    inventory?: string[];
    client_meta?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
  const enteredPin = typeof body.entered_pin === "string" ? body.entered_pin : "";
  const terminalFound = body.terminal_found === true;
  const cabinetFound = body.cabinet_found === true;
  const keypadSolved = body.keypad_solved === true;

  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  try {
    const result = await finishEscapeSession({
      userId,
      sessionId,
      enteredPin,
      terminalFound,
      cabinetFound,
      keypadSolved,
      inventory: Array.isArray(body.inventory) ? body.inventory : [],
      clientMeta: body.client_meta && typeof body.client_meta === "object" ? body.client_meta : {},
    });
    return NextResponse.json({
      ok: true,
      session: result.session,
      standing: result.standing,
      standings: result.standings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finish game";
    const status =
      message.toLowerCase().includes("not found") ||
      message.toLowerCase().includes("already finished")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
