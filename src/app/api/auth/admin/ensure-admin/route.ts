import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isSuperAdminRequest } from "@/lib/admin-auth";

async function getEnsureAdminAccess(request: Request): Promise<{
  allowed: boolean;
  viaSetupSecret: boolean;
  viaSuperAdmin: boolean;
}> {
  const viaSuperAdmin = await isSuperAdminRequest(request);
  if (viaSuperAdmin) {
    return { allowed: true, viaSetupSecret: false, viaSuperAdmin: true };
  }
  const secret = process.env.ADMIN_SETUP_SECRET;
  if (!secret) {
    return { allowed: false, viaSetupSecret: false, viaSuperAdmin: false };
  }
  const provided = request.headers.get("x-admin-setup-secret");
  const viaSetupSecret = !!provided && provided === secret;
  return { allowed: viaSetupSecret, viaSetupSecret, viaSuperAdmin: false };
}

/**
 * One-time setup: ensure an admin user exists in Supabase Auth and public.users.
 * Requires ADMIN_SETUP_SECRET header or authenticated super-admin session.
 */
export async function POST(request: Request) {
  try {
    const access = await getEnsureAdminAccess(request);
    if (!access.allowed) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const superAdmin = body.isSuperAdmin === true;
    if (!email || !email.includes("@")) {
      return NextResponse.json({ message: "Valid email is required" }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ message: "Password required (min 6 characters)" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ message: "Server not configured" }, { status: 503 });
    }

    if (access.viaSetupSecret && !access.viaSuperAdmin) {
      const { data: existingAdmin } = await supabase
        .from("users")
        .select("id")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      if (existingAdmin?.id) {
        return NextResponse.json(
          { message: "Bootstrap secret is disabled after first admin is created." },
          { status: 403 }
        );
      }
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
        if (existing) {
          userId = (existing as { id: string }).id;
        } else {
          const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
          if (listError) {
            return NextResponse.json({ message: listError.message }, { status: 500 });
          }
          const match = (listed?.users ?? []).find(
            (u) => (u.email ?? "").toLowerCase() === email
          );
          if (!match?.id) {
            return NextResponse.json({ message: "User exists but could not be located for profile sync." }, { status: 400 });
          }
          userId = match.id;
        }
        const { error: updatePwError } = await supabase.auth.admin.updateUserById(userId, { password });
        if (updatePwError) {
          return NextResponse.json({ message: "Could not set password: " + updatePwError.message }, { status: 400 });
        }
      } else {
        return NextResponse.json({ message: createError.message || "Failed to create user" }, { status: 400 });
      }
    } else if (newUser?.user?.id) {
      userId = newUser.user.id;
    } else {
      return NextResponse.json({ message: "Failed to create user" }, { status: 500 });
    }

    let { error: profileError } = await supabase
      .from("users")
      .upsert(
        {
          id: userId,
          email,
          role: "admin",
          is_super_admin: superAdmin,
          balance: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    if (profileError) {
      const retry = await supabase
        .from("users")
        .upsert(
          {
            id: userId,
            email,
            role: "admin",
            is_super_admin: superAdmin,
            created_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      profileError = retry.error;
    }
    if (profileError) {
      return NextResponse.json({ message: profileError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Admin account ready. Sign in with the email and password you used.",
      adminId: userId,
      email,
      isSuperAdmin: superAdmin,
    });
  } catch (e) {
    console.error("Ensure admin error:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
