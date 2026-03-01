import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getAdminUserId } from "@/lib/admin-auth";

/** POST /api/admin/wallets/credit — admin manual wallet credit (Bearer admin auth). */
export async function POST(request: Request) {
  const adminUserId = await getAdminUserId(request);
  if (!adminUserId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { userId?: string; amount?: number; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const amount = typeof body.amount === "number" ? Math.round(body.amount) : 0;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "Manual admin credit";

  if (!userId) {
    return NextResponse.json({ message: "userId is required" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ message: "amount must be a positive integer (cents)" }, { status: 400 });
  }

  const { error: rpcError } = await supabase.rpc("gp_admin_manual_credit", {
    p_admin_user_id: adminUserId,
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  });

  if (!rpcError) {
    return NextResponse.json({ ok: true });
  }

  // Backward compatibility fallback when RPC is not yet migrated.
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("balance")
    .eq("id", userId)
    .maybeSingle();
  if (userError || !userRow) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  const currentBalance = Number((userRow as { balance?: number }).balance ?? 0);
  await supabase
    .from("users")
    .update({ balance: currentBalance + amount, updated_at: new Date().toISOString() })
    .eq("id", userId);

  await supabase.from("transactions").insert({
    user_id: userId,
    type: "manual_credit",
    amount,
    status: "completed",
    description: reason,
    reference_id: adminUserId,
  });

  return NextResponse.json({ ok: true });
}
