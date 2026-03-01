import { NextResponse } from "next/server";
import { createAdminClient, createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, referralCode } = body as { email?: string; password?: string; referralCode?: string };
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ message: "Email and password required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ message: "Password must be at least 8 characters" }, { status: 400 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ message: "Auth not configured" }, { status: 503 });
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: referralCode ? { referred_by_code: referralCode.trim().toUpperCase() } : undefined,
      },
    });
    if (error || !data.user) {
      const message = error?.message ?? "Registration failed";
      const status = message.toLowerCase().includes("already") ? 409 : 400;
      return NextResponse.json({ message }, { status });
    }

    const admin = createAdminClient();
    if (admin) {
      const { error: upsertError } = await admin
        .from("users")
        .upsert(
          {
            id: data.user.id,
            email: data.user.email ?? email.trim(),
            role: "member",
            balance: 0,
            total_deposits: 0,
            total_withdrawals: 0,
            total_earnings: 0,
            withdrawable_balance: 0,
            pending_balance: 0,
            referred_by_code: referralCode ? referralCode.trim().toUpperCase() : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      if (upsertError) {
        console.warn("Auth register users upsert warning:", upsertError.message);
      }
    }

    const expiresAt = data.session?.expires_at
      ? new Date(data.session.expires_at * 1000).toISOString()
      : "";

    return NextResponse.json({
      user: { id: data.user.id, email: data.user.email ?? email.trim() },
      expiresAt,
      accessToken: data.session?.access_token ?? null,
      refreshToken: data.session?.refresh_token ?? null,
      needsConfirmation: !data.session,
    });
  } catch {
    return NextResponse.json({ message: "Registration failed" }, { status: 500 });
  }
}
