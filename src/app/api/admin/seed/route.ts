import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * One-time seed: create first admin if none exist.
 * Requires ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD, and ADMIN_SEED_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.ADMIN_SEED_SECRET;
  if (!secret) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  const provided = request.headers.get("x-seed-secret");
  if (provided !== secret) {
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
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  const { data: existingAdmin } = await supabase
    .from("users")
    .select("id")
    .or("role.eq.admin,is_super_admin.eq.true")
    .limit(1)
    .maybeSingle();
  if (existingAdmin?.id) {
    return NextResponse.json({ message: "An admin already exists" }, { status: 409 });
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json({ message: createError?.message ?? "Failed to create admin" }, { status: 500 });
  }

  const { error: upsertError } = await supabase
    .from("users")
    .upsert({
      id: created.user.id,
      email,
      role: "admin",
      updated_at: new Date().toISOString(),
    });
  if (upsertError) {
    return NextResponse.json({ message: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Admin created", user: { id: created.user.id, email } });
}
