import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin-auth";

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("revenue_transactions")
    .select("*")
    .order("created_at", { ascending: false });

  return NextResponse.json({ transactions: data ?? [] });
}
