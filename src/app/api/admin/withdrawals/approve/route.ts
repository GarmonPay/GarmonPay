import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/admin/withdrawals/approve — approve withdrawal, deduct balance, record transaction. */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { withdrawalId?: string; userId?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const { withdrawalId, userId, amount } = body;
  if (!withdrawalId || !userId || amount == null) {
    return NextResponse.json(
      { message: "withdrawalId, userId, and amount required" },
      { status: 400 }
    );
  }

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum < 0) {
    return NextResponse.json({ message: "Invalid amount" }, { status: 400 });
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  const currentBalance = Number((user as { balance?: number }).balance ?? 0);
  if (currentBalance < amountNum) {
    return NextResponse.json({ message: "Insufficient balance" }, { status: 400 });
  }

  await supabase
    .from("withdrawals")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", withdrawalId);

  await supabase.from("transactions").insert({
    user_id: userId,
    type: "withdrawal",
    amount: amountNum,
    status: "completed",
    description: "Withdrawal approved",
  });

  return NextResponse.json({ success: true });
}
