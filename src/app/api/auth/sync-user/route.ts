import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getClientIp } from "@/lib/rate-limit";
import { isAtLeastAge } from "@/lib/signup-compliance";
import { isStateExcludedFromParticipation, isValidUsStateCode } from "@/lib/us-states";
import { sendWelcomeEmail } from "@/lib/send-email";
import { creditCoins } from "@/lib/coins";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Referrer bonus when someone signs up with their code (GPC; 100 GPC = $1). */
const REFERRAL_SIGNUP_BONUS_GPC = 50;

async function ensureWalletBalanceRow(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error: wbErr } = await supabase.from("wallet_balances").insert({
    user_id: userId,
    balance: 0,
    updated_at: new Date().toISOString(),
  });
  if (wbErr && wbErr.code !== "23505") {
    console.warn("sync-user wallet_balances insert:", wbErr.message);
  }
}

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
    const sendWelcomeFlag = Boolean((body as { welcome?: boolean }).welcome);
    const userPayload = body?.user ?? body;
    const { id, email } = userPayload;
    const referralCode = body?.referralCode ?? userPayload?.referralCode ?? "";
    const fullName = typeof (body?.full_name ?? userPayload?.full_name) === "string"
      ? (body?.full_name ?? userPayload?.full_name).trim()
      : "";
    const rawDob =
      typeof (body?.date_of_birth ?? userPayload?.date_of_birth) === "string"
        ? (body?.date_of_birth ?? userPayload?.date_of_birth).trim()
        : "";
    const rawState =
      typeof (body?.residence_state ?? userPayload?.residence_state) === "string"
        ? (body?.residence_state ?? userPayload?.residence_state).trim().toUpperCase()
        : "";
    if (!id || typeof id !== "string") {
      return NextResponse.json({ message: "id required" }, { status: 400 });
    }

    const emailVal = typeof email === "string" ? email : "";
    const refCode = typeof referralCode === "string" ? referralCode.trim() : "";
    /** When a code was sent: true if linked to a referrer, false if unknown (signup still succeeds). */
    let referralApplied: boolean | undefined;

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

    if (rawDob && !isAtLeastAge(rawDob, 18)) {
      return NextResponse.json(
        { message: "Valid date of birth (18+) is required when provided." },
        { status: 400 },
      );
    }
    if (rawState) {
      if (!isValidUsStateCode(rawState)) {
        return NextResponse.json({ message: "A valid US state is required when provided." }, { status: 400 });
      }
      if (isStateExcludedFromParticipation(rawState)) {
        return NextResponse.json(
          { message: "Residents of Washington state are not eligible to register." },
          { status: 403 },
        );
      }
    }

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    const complianceFields = {
      date_of_birth: rawDob || null,
      residence_state: rawState || null,
    };

    if (existing) {
      const updatePayload: Record<string, unknown> = {
        email: emailVal,
        ...complianceFields,
      };
      if (fullName) updatePayload.full_name = fullName;
      const { error: updateError } = await supabase
        .from("users")
        .update(updatePayload)
        .eq("id", id);
      if (updateError) {
        console.error("Sync-user update error:", updateError);
        return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
      }
      await ensureWalletBalanceRow(supabase, id);
    } else {
      const registrationIp = getClientIp(req);
      const { error: insertError } = await supabase.from("users").insert({
        id,
        email: emailVal,
        full_name: fullName || null,
        ...complianceFields,
        role: "user",
        balance: 0,
        balance_cents: 0,
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
      await ensureWalletBalanceRow(supabase, id);
      try {
        const { grantSignupBonusGpc } = await import("@/lib/gpay-bonus-credits");
        await grantSignupBonusGpc(id);
      } catch (e) {
        console.warn("sync-user signup GPC bonus:", e);
      }
    }

    const { error: profileUpsertErr } = await supabase.from("profiles").upsert(
      {
        id,
        email: emailVal || null,
        date_of_birth: rawDob || null,
        residence_state: rawState || null,
      },
      { onConflict: "id" },
    );
    if (profileUpsertErr) {
      console.error("Sync-user profiles upsert:", profileUpsertErr);
      return NextResponse.json(
        { success: false, message: profileUpsertErr.message },
        { status: 500 },
      );
    }

    if (refCode) {
      referralApplied = false;
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
          await createReferral({
            referrerUserId: referrerId,
            referredUserId: id,
            referralCode: refCode,
            referredIp: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
          });
          referralApplied = true;
          const refKey = `referral_signup_bonus_${id}`;
          const bonus = await creditCoins(
            referrerId,
            0,
            REFERRAL_SIGNUP_BONUS_GPC,
            `Referral signup bonus — ${REFERRAL_SIGNUP_BONUS_GPC} GPC`,
            refKey,
            "referral_bonus"
          );
          if (
            bonus.success === false &&
            !/duplicate/i.test((bonus.message ?? "").toLowerCase())
          ) {
            console.warn("sync-user referral bonus:", bonus.message);
          }
        }
      } catch (refErr) {
        console.warn("Sync-user referral apply (optional):", refErr);
      }
    }

    if (sendWelcomeFlag && emailVal) {
      void sendWelcomeEmail({ to: emailVal, name: fullName || undefined }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      ...(typeof referralApplied === "boolean" ? { referralApplied } : {}),
    });
  } catch (e) {
    console.error("Sync-user error:", e);
    return NextResponse.json({ success: false, message: String(e) }, { status: 500 });
  }
}
