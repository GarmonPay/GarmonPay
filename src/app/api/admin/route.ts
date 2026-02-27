import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const access = await requireAdminAccess(request);
  if (!access.ok) {
    return access.response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json([]);
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("revenue_transactions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
  }

  return NextResponse.json(data ?? []);
}
