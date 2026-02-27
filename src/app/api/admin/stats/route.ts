import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase is not configured" }, { status: 503 });
  }

  const { data: adminUser, error: adminError } = await supabase
    .from("users")
    .select("id")
    .eq("id", adminId)
    .eq("role", "admin")
    .maybeSingle();

  if (adminError || !adminUser) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { count: totalUsers, error: usersError } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });
  const { data: deposits, error: depositsError } = await supabase
    .from("deposits")
    .select("amount");

  if (usersError || depositsError) {
    return NextResponse.json(
      { message: usersError?.message ?? depositsError?.message ?? "Failed to load stats" },
      { status: 500 }
    );
  }

  const totalDeposits = deposits?.reduce((sum, d) => sum + Number(d.amount), 0) || 0;

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    totalDeposits,
    totalRevenue: totalDeposits,
  });
}
