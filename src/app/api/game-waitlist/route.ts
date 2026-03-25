import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.email === "string" ? body.email.trim() : "";
    const email = raw.toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Server not configured." }, { status: 503 });
    }

    const { error } = await supabase.from("game_waitlist").insert({ email });
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({
          ok: true,
          message: "You are already on the list—we will notify you at launch.",
        });
      }
      console.error("game_waitlist insert:", error);
      return NextResponse.json({ ok: false, message: "Could not save. Try again later." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "You are on the list! We will email you when games launch." });
  } catch (e) {
    console.error("game-waitlist POST:", e);
    return NextResponse.json({ ok: false, message: "Unexpected error." }, { status: 500 });
  }
}
