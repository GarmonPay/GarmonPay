import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json([]);
  }

  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("revenue_transactions")
    .select("*")
    .order("created_at", { ascending: false });

  return NextResponse.json(data ?? []);
}
