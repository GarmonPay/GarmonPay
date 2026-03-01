import { NextResponse } from "next/server";
import { getSupabaseAuthUser } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

type WithdrawRequestBody = {
  amount?: number;
  amountCents?: number;
  method?: string;
  walletAddress?: string;
  wallet_address?: string;
};

/** POST /api/wallet/withdraw — create pending withdrawal request. */
export async function POST(request: Request) {
  const authUser = await getSupabaseAuthUser(request);
  if (!authUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: WithdrawRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  let amountCents = 0;
  if (typeof body.amountCents === "number" && Number.isFinite(body.amountCents)) {
    amountCents = Math.round(body.amountCents);
  } else if (typeof body.amount === "number" && Number.isFinite(body.amount)) {
    const hasFraction = !Number.isInteger(body.amount);
    if (hasFraction) {
      amountCents = Math.round(body.amount * 100);
    } else if (body.amount >= 100) {
      amountCents = Math.round(body.amount);
    } else {
      amountCents = Math.round(body.amount * 100);
    }
  }

  if (amountCents <= 0) {
    return NextResponse.json({ message: "Amount must be greater than 0" }, { status: 400 });
  }

  const methodRaw = (body.method ?? "bank").toLowerCase();
  const method = ["crypto", "paypal", "bank"].includes(methodRaw) ? methodRaw : "bank";
  const walletAddress = (body.walletAddress ?? body.wallet_address ?? "").trim() || "manual";

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("balance")
    .eq("id", authUser.id)
    .maybeSingle();
  if (userError || !user) {
    return NextResponse.json({ message: "User wallet not found" }, { status: 404 });
  }

  const balance = Number((user as { balance?: number }).balance ?? 0);
  if (balance < amountCents) {
    return NextResponse.json({ message: "Insufficient balance" }, { status: 400 });
  }

  let insert = await supabase
    .from("withdrawals")
    .insert({
      user_id: authUser.id,
      amount: amountCents,
      status: "pending",
      method,
      wallet_address: walletAddress,
    })
    .select("*")
    .single();

  if (insert.error) {
    // Fallback for older schemas where method/wallet_address columns may not exist.
    insert = await supabase
      .from("withdrawals")
      .insert({
        user_id: authUser.id,
        amount: amountCents,
        status: "pending",
      })
      .select("*")
      .single();
  }

  if (insert.error || !insert.data) {
    return NextResponse.json({ message: insert.error?.message ?? "Failed to submit withdrawal" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    withdrawal: insert.data,
    message: "Withdrawal submitted for admin approval",
  });
}
