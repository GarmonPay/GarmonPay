import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const ALLOWED_ADMIN_EMAIL = "admin123@garmonpay.com";
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — only allow syncing recently created auth users

/** Sync auth user into public.users. Requires either Bearer token (sub === id) or id must be a recently created auth user. */
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

    // Security: allow only if (1) Bearer token subject matches id, or (2) id is a recently created auth user
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    let allowed = false;

    if (bearerToken) {
      const { createServerClient } = await import("@/lib/supabase");
      const server = createServerClient(bearerToken);
      if (server) {
        const { data: { user } } = await server.auth.getUser();
        if (user && user.id === id) allowed = true;
      }
    }

    if (!allowed) {
      const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(id);
      if (authErr || !authUser?.user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
      const createdAt = authUser.user.created_at
        ? new Date(authUser.user.created_at).getTime()
        : 0;
      if (Date.now() - createdAt > MAX_AGE_MS) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
      allowed = true;
    }

    if (!allowed) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

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
      try {
        const { error: walletErr } = await supabase.from("wallet").upsert({
          user_id: id,
          balance: 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (walletErr) {
          console.warn("Sync-user wallet upsert (optional):", walletErr.message);
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
