import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

export async function POST(req) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const amount = Number(body.amount ?? 0);
  if (!email || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { success: false, error: "email and positive amount required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Server not configured" },
      { status: 500 }
    );
  }

  const { data: current, error: readError } = await supabase
    .from("advertisers")
    .select("balance")
    .eq("email", email)
    .maybeSingle();
  if (readError || !current) {
    return NextResponse.json({ success: false, error: "Advertiser not found" }, { status: 404 });
  }

  await supabase
    .from("advertisers")
    .update({
      balance: Number(current.balance ?? 0) + amount,
    })
    .eq("email", email);

  return NextResponse.json({ success: true });
}
