import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WAITLIST_TYPES = new Set(["creator", "earner", "general"]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.email === "string" ? body.email.trim() : "";
    const email = raw.toLowerCase();
    const type =
      typeof body?.type === "string" && WAITLIST_TYPES.has(body.type)
        ? body.type
        : null;
    const source =
      typeof body?.source === "string" && body.source.trim()
        ? body.source.trim().slice(0, 200)
        : null;

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { ok: false, message: "Enter a valid email address." },
        { status: 400 }
      );
    }
    if (!type) {
      return NextResponse.json(
        { ok: false, message: "Invalid waitlist type." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, message: "Server not configured." },
        { status: 503 }
      );
    }

    const { error } = await supabase.from("waitlist").insert({
      email,
      type,
      source,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          {
            ok: true,
            duplicate: true,
            message: "You are already on the waitlist.",
          },
          { status: 409 }
        );
      }
      console.error("waitlist insert:", error);
      return NextResponse.json(
        { ok: false, message: "Could not save. Try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "You are on the waitlist. We will be in touch soon.",
    });
  } catch (e) {
    console.error("waitlist POST:", e);
    return NextResponse.json(
      { ok: false, message: "Unexpected error." },
      { status: 500 }
    );
  }
}
