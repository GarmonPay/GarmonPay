import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";

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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ message: "Authentication is not configured" }, { status: 503 });
    }

    const authClient = createClient(url, anonKey);
    const { data, error } = await authClient.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error || !data.user) {
      const message = error?.message ?? "Registration failed";
      const status = error?.message?.toLowerCase().includes("already registered") ? 409 : 400;
      return NextResponse.json({ message }, { status });
    }

    const normalizedReferralCode = typeof referralCode === "string" ? referralCode.trim() : "";
    if (normalizedReferralCode) {
      const admin = createAdminClient();
      if (admin) {
        await admin
          .from("users")
          .update({ referred_by_code: normalizedReferralCode })
          .eq("id", data.user.id);
      }
    }

    const expiresAt = data.session?.expires_at
      ? new Date(data.session.expires_at * 1000).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();
    return NextResponse.json({
      user: { id: data.user.id, email: data.user.email ?? email.trim() },
      expiresAt,
      accessToken: data.session?.access_token ?? null,
    });
  } catch {
    return NextResponse.json({ message: "Registration failed" }, { status: 500 });
  }
}
