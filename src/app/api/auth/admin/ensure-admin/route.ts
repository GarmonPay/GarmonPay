import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const ALLOWED_ADMIN_EMAIL = "admin123@garmonpay.com";

async function findAuthUserIdByEmail(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  email: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();

  // Supabase Auth Admin has listUsers pagination; scan pages to locate email.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      console.error("Ensure admin listUsers error:", error);
      return null;
    }
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (match?.id) return match.id;
    if (users.length < 200) break;
  }
  return null;
}

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

    let userId = await findAuthUserIdByEmail(supabase, email);

    // 1) Create admin in Supabase Auth if not exists.
    if (!userId) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        const msg = (createError.message || "").toLowerCase();
        if (!msg.includes("already") && !msg.includes("registered")) {
          return NextResponse.json(
            { message: createError.message || "Failed to create admin auth user" },
            { status: 400 }
          );
        }
        // Race-safe fallback when account already exists.
        userId = await findAuthUserIdByEmail(supabase, email);
      } else {
        userId = created?.user?.id ?? null;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { message: "Could not resolve admin auth user id" },
        { status: 500 }
      );
    }

    // Keep password in sync for this bootstrap endpoint.
    const { error: updatePwError } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updatePwError) {
      return NextResponse.json(
        { message: `Could not set admin password: ${updatePwError.message}` },
        { status: 400 }
      );
    }

    // 2) Ensure public.users row exists and has role=admin.
    const { error: profileError } = await supabase
      .from("users")
      .upsert(
        {
          id: userId,
          email,
          role: "admin",
        },
        { onConflict: "id" }
      );
    if (profileError) {
      console.error("Ensure admin profile upsert error:", profileError);
      return NextResponse.json(
        { message: "Created auth user but failed to update public.users role" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      userId,
      role: "admin",
      message: "Admin account ready. Sign in with the email and password you used.",
    });
  } catch (e) {
    console.error("Ensure admin error:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
