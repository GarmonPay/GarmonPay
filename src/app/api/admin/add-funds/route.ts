import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/admin/add-funds — add balance to a user (admin only). */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { userId?: string; amountCents?: number; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const { userId, amountCents: amountCentsBody, amount: amountDollars } = body;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ message: "userId required" }, { status: 400 });
  }

  let amountCents: number;
  if (typeof amountCentsBody === "number" && Number.isFinite(amountCentsBody)) {
    amountCents = Math.round(amountCentsBody);
  } else if (typeof amountDollars === "number" && Number.isFinite(amountDollars)) {
    amountCents = Math.round(amountDollars * 100);
  } else {
    return NextResponse.json({ message: "amount or amountCents required" }, { status: 400 });
  }

  if (amountCents <= 0) {
    return NextResponse.json({ message: "Amount must be positive" }, { status: 400 });
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  const { error: rpcError } = await supabase.rpc("increment_user_balance", {
    p_user_id: userId,
    p_amount_cents: amountCents,
  });
  if (rpcError) {
    // Fallback for environments without RPC migration.
    const { data: balanceRow, error: balanceError } = await supabase
      .from("users")
      .select("balance")
      .eq("id", userId)
      .single();
    if (balanceError || !balanceRow) {
      return NextResponse.json({ message: "Failed to load user balance" }, { status: 500 });
    }
    const nextBalance = Number((balanceRow as { balance?: number }).balance ?? 0) + amountCents;
    const { error: updateError } = await supabase
      .from("users")
      .update({ balance: nextBalance, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (updateError) {
      return NextResponse.json({ message: updateError.message }, { status: 500 });
    }
  }

  const { error: txError } = await supabase.from("transactions").insert({
    user_id: userId,
    type: "deposit",
    amount: amountCents,
    status: "completed",
    description: "Admin add funds",
  });
  if (txError) {
    return NextResponse.json({ message: txError.message }, { status: 500 });
  }

  const { data: updatedUser } = await supabase
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();

  return NextResponse.json({
    success: true,
    amountCents,
    balanceCents: Number((updatedUser as { balance?: number } | null)?.balance ?? 0),
  });
}
