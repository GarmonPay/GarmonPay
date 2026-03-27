import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getClientIp } from "@/lib/rate-limit";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import { REFERRAL_JOIN_BONUS_CENTS } from "@/lib/adTracker";

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
    const userPayload = body?.user ?? body;
    const { id, email } = userPayload;
    const referralCode = body?.referralCode ?? userPayload?.referralCode ?? "";
    if (!id || typeof id !== "string") {
      return NextResponse.json({ message: "id required" }, { status: 400 });
    }

    const emailVal = typeof email === "string" ? email : "";
    const refCode = typeof referralCode === "string" ? referralCode.trim() : "";

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
      const registrationIp = getClientIp(req);
      const { error: insertError } = await supabase.from("users").insert({
        id,
        email: emailVal,
        role: "user",
        balance: 0,
        membership: "free",
        created_at: new Date().toISOString(),
        registration_ip: registrationIp !== "unknown" ? registrationIp : null,
      });
      if (insertError) {
        console.error("Sync-user insert error:", insertError);
        return NextResponse.json({ success: false, message: insertError.message }, { status: 500 });
      }
      try {
        await supabase.from("security_events").insert({
          user_id: id,
          email: emailVal,
          ip_text: registrationIp !== "unknown" ? registrationIp : null,
          event_type: "signup",
        });
      } catch {
        // best-effort
      }
      try {
        const { error: walletErr } = await supabase.from("wallets").insert({
          user_id: id,
          balance: 0,
        });
        if (walletErr) {
          console.warn("Sync-user wallets insert (optional):", walletErr.message);
        }
      } catch {
        // ignore
      }
    }

    if (refCode) {
      try {
        const { data: referrer } = await supabase.from("users").select("id").eq("referral_code", refCode).maybeSingle();
        const referrerId = (referrer as { id?: string } | null)?.id;
        if (referrerId && referrerId !== id) {
          await supabase.from("users").update({
            referred_by_code: refCode,
            referred_by: referrerId,
            updated_at: new Date().toISOString(),
          }).eq("id", id);
          const { createReferral } = await import("@/lib/viral-referral-db");
          const result = await createReferral({
            referrerUserId: referrerId,
            referredUserId: id,
            referralCode: refCode,
            grantSignupBonus: false,
            referredIp: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
          });
          if (result?.success) {
            const refId = `referral_join_${id}`;
            const { data: existingJoinTx } = await supabase
              .from("transactions")
              .select("id")
              .eq("reference_id", refId)
              .maybeSingle();
            if (!existingJoinTx) {
              const joinCredit = await walletLedgerEntry(
                referrerId,
                "referral_bonus",
                REFERRAL_JOIN_BONUS_CENTS,
                refId
              );
              if (joinCredit.success) {
                await supabase.from("transactions").insert({
                  user_id: referrerId,
                  type: "referral_join",
                  amount: REFERRAL_JOIN_BONUS_CENTS,
                  status: "completed",
                  description: "Referral join bonus",
                  reference_id: refId,
                });
              }
            }
          }
        }
      } catch (refErr) {
        console.warn("Sync-user referral apply (optional):", refErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Sync-user error:", e);
    return NextResponse.json({ success: false, message: String(e) }, { status: 500 });
  }
}
