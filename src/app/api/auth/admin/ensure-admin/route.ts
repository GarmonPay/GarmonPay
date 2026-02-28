import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const ALLOWED_ADMIN_EMAIL = "admin123@garmonpay.com";

/**
 * One-time setup: ensure an admin user exists in Supabase Auth and public.users.
 * Only allows the fixed admin email. Creates the user if missing and sets role=admin.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (email !== ALLOWED_ADMIN_EMAIL) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ message: "Password required (min 6 characters)" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ message: "Server not configured" }, { status: 503 });
    }

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    let userId: string;

    if (createError) {
      const msg = createError.message || "";
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
        const { data: existing } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
        if (!existing) {
          return NextResponse.json({ message: "User exists in Auth but no profile. Add a row in public.users with role='admin'." }, { status: 400 });
        }
        userId = (existing as { id: string }).id;
      } else {
        return NextResponse.json({ message: createError.message || "Failed to create user" }, { status: 400 });
      }
    } else if (newUser?.user?.id) {
      userId = newUser.user.id;
    } else {
      return NextResponse.json({ message: "Failed to create user" }, { status: 500 });
    }

    await supabase.from("users").update({ role: "admin", updated_at: new Date().toISOString() }).eq("id", userId);

    return NextResponse.json({ ok: true, message: "Admin account ready. Sign in with the email and password you used." });
  } catch (e) {
    console.error("Ensure admin error:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
