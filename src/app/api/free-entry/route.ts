import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { creditCoins } from "@/lib/coins";
import { getClientIp } from "@/lib/rate-limit";

const SC_FREE_ENTRY = 10;

function currentMonthYearUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * POST /api/free-entry
 * Body: { fullName, email, username } — username must match account referral code for the email.
 */
export async function POST(request: Request) {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { fullName?: unknown; email?: unknown; username?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const usernameRaw = typeof body.username === "string" ? body.username.trim() : "";

  if (!fullName || fullName.length > 200) {
    return NextResponse.json({ message: "Full name is required." }, { status: 400 });
  }
  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return NextResponse.json({ message: "A valid email address is required." }, { status: 400 });
  }
  if (!usernameRaw || usernameRaw.length > 64) {
    return NextResponse.json({ message: "GarmonPay username is required." }, { status: 400 });
  }

  const emailNorm = normalizeEmail(emailRaw);
  const codeNorm = usernameRaw.toUpperCase();
  const monthYear = currentMonthYearUtc();
  const ip = getClientIp(request);

  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("id, email, referral_code")
    .ilike("email", emailNorm)
    .maybeSingle();

  if (userErr) {
    console.error("[free-entry] user lookup:", userErr.message);
    return NextResponse.json({ message: "Unable to verify account." }, { status: 500 });
  }

  const row = userRow as { id?: string; referral_code?: string | null } | null;
  if (!row?.id) {
    return NextResponse.json(
      { message: "No GarmonPay account found for this email address." },
      { status: 400 }
    );
  }

  const accountCode = (row.referral_code ?? "").trim().toUpperCase();
  if (!accountCode || accountCode !== codeNorm) {
    return NextResponse.json(
      { message: "Username does not match our records for this email address." },
      { status: 400 }
    );
  }

  const { data: emailDup } = await supabase
    .from("free_entries")
    .select("id")
    .eq("month_year", monthYear)
    .eq("email", emailNorm)
    .maybeSingle();

  if (emailDup) {
    return NextResponse.json(
      { message: "You have already claimed your free entry this month." },
      { status: 400 }
    );
  }

  if (ip && ip !== "unknown") {
    const { data: ipDup } = await supabase
      .from("free_entries")
      .select("id")
      .eq("month_year", monthYear)
      .eq("ip_address", ip)
      .maybeSingle();
    if (ipDup) {
      return NextResponse.json(
        { message: "You have already claimed your free entry this month." },
        { status: 400 }
      );
    }
  }

  const reference = `free_entry_online_${row.id}_${monthYear}`;
  const credit = await creditCoins(
    row.id,
    0,
    SC_FREE_ENTRY,
    "Free GPay Coins entry (online, no purchase necessary)",
    reference,
    "free_entry"
  );

  if (!credit.success) {
    const dup = (credit.message ?? "").toLowerCase().includes("duplicate");
    if (dup) {
      return NextResponse.json(
        { message: "You have already claimed your free entry this month." },
        { status: 400 }
      );
    }
    return NextResponse.json({ message: credit.message ?? "Could not credit account." }, { status: 400 });
  }

  const { error: insErr } = await supabase.from("free_entries").insert({
    user_id: row.id,
    email: emailNorm,
    ip_address: ip !== "unknown" ? ip : null,
    month_year: monthYear,
  });

  if (insErr) {
    console.error("[free-entry] insert after credit:", insErr.message);
    return NextResponse.json(
      { message: "Entry recorded partially. Contact support if GPay Coins are missing." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
