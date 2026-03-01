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

    const client = createServerClient();
    if (!client) {
      return NextResponse.json({ message: "Auth not configured" }, { status: 503 });
    }

    const { data: signUp, error: signUpError } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: referralCode ? { data: { referred_by_code: referralCode } } : undefined,
    });
    if (signUpError || !signUp.user) {
      const msg = signUpError?.message ?? "Registration failed";
      const duplicate = msg.toLowerCase().includes("already");
      return NextResponse.json({ message: msg }, { status: duplicate ? 409 : 400 });
    }

    const adminClient = createAdminClient();
    if (adminClient) {
      await adminClient
        .from("users")
        .upsert(
          {
            id: signUp.user.id,
            email: signUp.user.email ?? email.trim(),
            role: "user",
            balance: 0,
            total_deposits: 0,
            withdrawable_balance: 0,
            pending_balance: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...(referralCode ? { referred_by_code: referralCode.trim().toUpperCase() } : {}),
          },
          { onConflict: "id" }
        );
    }

    const expiresAt = signUp.session?.expires_at
      ? new Date(signUp.session.expires_at * 1000).toISOString()
      : null;
    return NextResponse.json({
      user: { id: signUp.user.id, email: signUp.user.email ?? email.trim() },
      expiresAt,
      accessToken: signUp.session?.access_token ?? null,
      needsConfirmation: !signUp.session,
    });
  } catch {
    return NextResponse.json({ message: "Registration failed" }, { status: 500 });
  }
}
