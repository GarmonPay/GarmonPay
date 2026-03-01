import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { createServerClient } from "@/lib/supabase";

/** Sync auth user into public.users (and optionally wallets). Called after signUp so admin dashboard shows real user count. REAL DB only. */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!bearerToken) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const userClient = createServerClient(bearerToken);
    if (!userClient) {
      return NextResponse.json({ success: false, message: "Auth not configured" }, { status: 503 });
    }
    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ message: "Server not configured" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, email } = body?.user ?? body;
    const userId = typeof id === "string" ? id : authUser.id;
    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ message: "id required" }, { status: 400 });
    }
    if (userId !== authUser.id) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const emailVal = (authUser.email ?? "").trim().toLowerCase();

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existing) {
      let { error: updateError } = await supabase
        .from("users")
        .update({ email: emailVal, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (updateError && updateError.message?.toLowerCase().includes("updated_at")) {
        const retry = await supabase
          .from("users")
          .update({ email: emailVal })
          .eq("id", userId);
        updateError = retry.error;
      }
      if (updateError) {
        console.error("Sync-user update error:", updateError);
        return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
      }
    } else {
      let { error: insertError } = await supabase.from("users").insert({
        id: userId,
        email: emailVal,
        role: "user",
        balance: 0,
        total_deposits: 0,
        withdrawable_balance: 0,
        pending_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (insertError) {
        // Older schemas may miss some financial columns; retry with minimal profile fields.
        const retry = await supabase.from("users").insert({
          id: userId,
          email: emailVal,
          role: "user",
          balance: 0,
          created_at: new Date().toISOString(),
        });
        insertError = retry.error;
      }
      if (insertError) {
        console.error("Sync-user insert error:", insertError);
        return NextResponse.json({ success: false, message: insertError.message }, { status: 500 });
      }
      // If wallets table exists, create a row for this user (balance = 0)
      try {
        const { error: walletErr } = await supabase.from("wallets").insert({
          user_id: userId,
          balance: 0,
        });
        if (walletErr) {
          // Table may not exist or RLS; log but do not fail
          console.warn("Sync-user wallets insert (optional):", walletErr.message);
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Sync-user error:", e);
    return NextResponse.json({ success: false, message: String(e) }, { status: 500 });
  }
}
