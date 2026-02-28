import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/** Sync auth user into public.users (and optionally wallets). Called after signUp so admin dashboard shows real user count. REAL DB only. */
export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ message: "Server not configured" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, email } = body?.user ?? body;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ message: "id required" }, { status: 400 });
    }

    const emailVal = typeof email === "string" ? email : "";

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from("users")
        .update({ email: emailVal })
        .eq("id", id);
      if (updateError) {
        console.error("Sync-user update error:", updateError);
        return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabase.from("users").insert({
        id,
        email: emailVal,
        role: "user",
        balance: 0,
        created_at: new Date().toISOString(),
      });
      if (insertError) {
        console.error("Sync-user insert error:", insertError);
        return NextResponse.json({ success: false, message: insertError.message }, { status: 500 });
      }
      // If wallets table exists, create a row for this user (balance = 0)
      try {
        const { error: walletErr } = await supabase.from("wallets").insert({
          user_id: id,
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
