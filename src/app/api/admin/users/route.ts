import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminAccess } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const access = await requireAdminAccess(request);
  if (!access.ok) {
    return access.response;
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return NextResponse.json({ message: "Failed to load users" }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] });
}
