import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { applyWalletAdjustment } from "@/lib/wallet-ledger";
import { logAdminAction } from "@/lib/admin-logs";

function parseAmountCents(body: { amountCents?: unknown; amount?: unknown }): number | null {
  if (typeof body.amountCents === "number" && Number.isFinite(body.amountCents)) {
    return Math.round(body.amountCents);
  }
  if (typeof body.amount === "number" && Number.isFinite(body.amount)) {
    return Math.round(body.amount * 100);
  }
  return null;
}

/** GET /api/admin/users — list users (supports ?q= search). */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  const limitRaw = Number(new URL(request.url).searchParams.get("limit") ?? 500);
  const limit = Number.isFinite(limitRaw) ? Math.min(1000, Math.max(1, Math.round(limitRaw))) : 500;

  const { data: users, error } = await supabase
    .from("users")
    .select(
      "id, email, role, balance, total_deposits, total_withdrawals, total_earnings, is_banned, is_super_admin, banned_reason, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  let sourceRows = users;
  if (error) {
    console.error("Admin users query error:", error);
    // Backward compatibility for older schemas missing aggregate/ban columns.
    const fallback = await supabase
      .from("users")
      .select("id, email, role, balance, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (fallback.error) {
      return NextResponse.json({ message: fallback.error.message, users: [] }, { status: 500 });
    }
    sourceRows = (fallback.data ?? []).map((row) => ({
      ...row,
      total_deposits: 0,
      total_withdrawals: 0,
      total_earnings: 0,
      is_banned: false,
      is_super_admin: false,
      banned_reason: null,
    }));
  }

  const list = (sourceRows ?? []) as Array<{
    id: string;
    email?: string | null;
    role?: string | null;
    balance?: number | null;
    total_deposits?: number | null;
    total_withdrawals?: number | null;
    total_earnings?: number | null;
    is_banned?: boolean | null;
    is_super_admin?: boolean | null;
    banned_reason?: string | null;
    created_at?: string | null;
  }>;

  const filtered = q
    ? list.filter((u) => {
        const email = (u.email ?? "").toLowerCase();
        const id = (u.id ?? "").toLowerCase();
        return email.includes(q) || id.includes(q);
      })
    : list;

  return NextResponse.json({ users: filtered });
}

/**
 * PATCH /api/admin/users
 * Body:
 * - { userId, action: "add_funds" | "subtract_funds", amountCents|amount }
 * - { userId, action: "ban" | "unban", reason? }
 */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const adminId = request.headers.get("x-admin-id") ?? "";
  let body: {
    userId?: string;
    action?: string;
    amountCents?: number;
    amount?: number;
    reason?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!userId || !action) {
    return NextResponse.json({ message: "userId and action are required" }, { status: 400 });
  }

  const { data: targetUser, error: targetError } = await supabase
    .from("users")
    .select("id, is_super_admin, is_banned")
    .eq("id", userId)
    .maybeSingle();
  if (targetError || !targetUser) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  const target = targetUser as { id: string; is_super_admin?: boolean; is_banned?: boolean };
  if (target.is_super_admin && action !== "unban") {
    return NextResponse.json({ message: "Cannot modify super admin account" }, { status: 403 });
  }

  if (action === "ban" || action === "unban") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const isBanned = action === "ban";
    const { error: banError } = await supabase
      .from("users")
      .update({
        is_banned: isBanned,
        banned_at: isBanned ? new Date().toISOString() : null,
        banned_reason: isBanned ? reason || "Banned by admin" : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (banError) {
      return NextResponse.json({ message: banError.message }, { status: 500 });
    }

    if (adminId) {
      await logAdminAction({
        adminId,
        action: isBanned ? "user_ban" : "user_unban",
        targetUserId: userId,
        metadata: isBanned ? { reason: reason || null } : undefined,
      });
    }

    return NextResponse.json({ success: true, action, userId });
  }

  if (action === "add_funds" || action === "subtract_funds") {
    const amountCents = parseAmountCents(body);
    if (amountCents == null || amountCents <= 0) {
      return NextResponse.json({ message: "Valid amount/amountCents is required" }, { status: 400 });
    }

    const direction = action === "add_funds" ? "credit" : "debit";
    const walletResult = await applyWalletAdjustment({
      userId,
      amountCents,
      direction,
      track: "none",
      affectWithdrawable: true,
      allowNegative: false,
    });
    if (!walletResult.success) {
      return NextResponse.json(
        { message: walletResult.message ?? "Wallet update failed" },
        { status: 400 }
      );
    }

    const signedAmount = direction === "credit" ? amountCents : -amountCents;
    const { error: txError } = await supabase.from("transactions").insert({
      user_id: userId,
      type: "adjustment",
      amount: signedAmount,
      status: "completed",
      description:
        direction === "credit" ? "Admin manual credit" : "Admin manual debit",
    });
    if (txError) {
      console.error("Admin user adjustment transaction error:", txError);
    }

    if (adminId) {
      await logAdminAction({
        adminId,
        action: direction === "credit" ? "wallet_manual_credit" : "wallet_manual_debit",
        targetUserId: userId,
        amountCents,
        metadata: { endpoint: "/api/admin/users" },
      });
    }

    return NextResponse.json({
      success: true,
      action,
      userId,
      amountCents,
      balanceCents: walletResult.balanceCents ?? null,
    });
  }

  return NextResponse.json({ message: "Unsupported action" }, { status: 400 });
}
