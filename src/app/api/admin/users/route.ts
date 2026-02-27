import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findUserById, hasAdminAccess } from "@/lib/auth-store";

type PublicUserRow = {
  id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
  [key: string]: unknown;
};

function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

function isAdmin(request: Request): boolean {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return false;
  const user = findUserById(adminId);
  return !!(user && hasAdminAccess(user));
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createPublicClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase public client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY." },
      { status: 503 }
    );
  }

  // Required production queries for admin user list and count.
  const [countRes, usersRes] = await Promise.all([
    supabase
      .from("public.users")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("public.users")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (countRes.error || usersRes.error) {
    return NextResponse.json(
      { message: "Failed to fetch users from Supabase", error: countRes.error?.message ?? usersRes.error?.message },
      { status: 500 }
    );
  }

  const users = (usersRes.data ?? []) as PublicUserRow[];
  return NextResponse.json(
    {
      totalUsers: countRes.count ?? users.length,
      users,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
