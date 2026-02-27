import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ rows: [] });
  }

  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("revenue_transactions")
    .select("*")
    .order("created_at", { ascending: false });

  return NextResponse.json({ rows: data ?? [] });
}
