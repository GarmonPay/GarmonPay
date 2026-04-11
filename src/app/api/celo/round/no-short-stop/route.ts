import { NextResponse } from "next/server";

/** Short stop / "no short stop" are not part of C-Lo rules; endpoint retained for backwards compatibility. */
export async function POST() {
  return NextResponse.json(
    { error: "Short stop is not part of C-Lo rules.", message: "Short stop is not part of C-Lo rules." },
    { status: 410 }
  );
}
