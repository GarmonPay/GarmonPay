import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { applyWalletAdjustment } from "@/lib/wallet-ledger";
import { logAdminAction } from "@/lib/admin-logs";

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
    .select("id, is_super_admin")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }
  if ((user as { is_super_admin?: boolean }).is_super_admin) {
    return NextResponse.json({ message: "Cannot modify super admin account" }, { status: 403 });
  }

  const walletResult = await applyWalletAdjustment({
    userId,
    amountCents,
    direction: "credit",
    track: "none",
    affectWithdrawable: true,
  });
  if (!walletResult.success) {
    return NextResponse.json(
      { message: walletResult.message ?? "Could not update wallet" },
      { status: 400 }
    );
  }

  const { error: txError } = await supabase.from("transactions").insert({
    user_id: userId,
    type: "adjustment",
    amount: amountCents,
    status: "completed",
    description: "Admin manual credit",
  });
  if (txError) {
    console.error("Admin add-funds transaction insert error:", txError);
  }

  const adminId = req.headers.get("x-admin-id") ?? "";
  if (adminId) {
    await logAdminAction({
      adminId,
      action: "wallet_manual_credit",
      targetUserId: userId,
      amountCents,
      metadata: { endpoint: "/api/admin/add-funds" },
    });
  }

  return NextResponse.json({
    success: true,
    amountCents,
    balanceCents: walletResult.balanceCents ?? null,
  });
}
