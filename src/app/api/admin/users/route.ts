import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/users — list all users from public.users. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: users, error } = await supabase
    .from("users")
    .select("id, email, role, balance, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Admin users query error:", error);
    const message =
      error.message && error.message.includes("balance")
        ? "Missing column: run migration 20250242000000_add_users_balance_column.sql in Supabase SQL Editor (adds balance to public.users)."
        : error.message;
    return NextResponse.json({ message, users: [] }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] });
}
