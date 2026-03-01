import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isSuperAdminRequest } from "@/lib/admin-auth";

async function canSeedAdmin(request: Request): Promise<boolean> {
  if (await isSuperAdminRequest(request)) return true;
  const secret = process.env.ADMIN_SETUP_SECRET;
  if (!secret) return false;
  const provided = request.headers.get("x-admin-setup-secret");
  return !!provided && provided === secret;
}

/**
 * One-time seed: create first admin if none exist.
 * Requires ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD and ADMIN_SETUP_SECRET or super admin auth.
 */
export async function POST(request: Request) {
  if (!(await canSeedAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) {
    return NextResponse.json(
      { message: "Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD to seed first admin" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 503 });
  }

  const { data: existingAdmin, error: adminLookupError } = await supabase
    .from("users")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (!adminLookupError && existingAdmin) {
    return NextResponse.json({ message: "An admin already exists", adminId: existingAdmin.id }, { status: 409 });
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
  });

  let userId = created?.user?.id ?? "";
  if (createError && userId.length === 0) {
    const msg = createError.message?.toLowerCase() ?? "";
    if (!msg.includes("already") && !msg.includes("registered")) {
      return NextResponse.json({ message: createError.message || "Failed to create auth user" }, { status: 500 });
    }

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();
    if (existing?.id) {
      userId = existing.id;
    } else {
      const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) {
        return NextResponse.json({ message: listError.message }, { status: 500 });
      }
      const match = (listed?.users ?? []).find(
        (u) => (u.email ?? "").toLowerCase() === email.toLowerCase().trim()
      );
      if (!match?.id) {
        return NextResponse.json(
          { message: "Existing auth user could not be located for admin seeding." },
          { status: 400 }
        );
      }
      userId = match.id;
    }
    await supabase.auth.admin.updateUserById(userId, { password });
  }

  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve admin user id" }, { status: 500 });
  }

  let { error: profileError } = await supabase
    .from("users")
    .upsert(
      {
        id: userId,
        email: email.toLowerCase().trim(),
        role: "admin",
        is_super_admin: false,
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
          email: email.toLowerCase().trim(),
          role: "admin",
          is_super_admin: false,
          created_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    profileError = retry.error;
  }
  if (profileError) {
    return NextResponse.json({ message: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Admin seeded", user: { id: userId, email: email.toLowerCase().trim() } });
}
