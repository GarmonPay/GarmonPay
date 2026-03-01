import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin-auth";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_")) return null;
  return new Stripe(key, { apiVersion: "2026-01-28.clover" });
}

/**
 * POST /api/admin/recover-payments
 * Credits user balance for existing Stripe checkout.session.completed events
 * that were not credited (e.g. before webhook/RLS fix). Admin only.
 * Query: ?limit=100 (default 100), ?dry_run=true to only list what would be done.
 */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ message: "Stripe not configured" }, { status: 503 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ message: "Supabase not configured" }, { status: 503 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));
  const dryRun = searchParams.get("dry_run") === "true";

  const result = {
    dryRun,
    limit,
    processed: 0,
    skipped: 0,
    skippedNoEmail: 0,
    skippedUserNotFound: 0,
    skippedAlreadyRecovered: 0,
    errors: [] as string[],
  };

  let events: Stripe.Event[];
  try {
    const res = await stripe.events.list({
      type: "checkout.session.completed",
      limit,
    });
    events = res.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe events list failed";
    return NextResponse.json({ message: "Stripe error", error: msg }, { status: 502 });
  }

  const seenSessionIds = new Set<string>();

  for (const event of events) {
    const session = event.data.object as Stripe.Checkout.Session;
    const sessionId = session.id;
    if (seenSessionIds.has(sessionId)) {
      result.skippedAlreadyRecovered += 1;
      continue;
    }
    seenSessionIds.add(sessionId);

    const email = session.customer_email;
    const amountTotal = session.amount_total ?? 0;
    const amountCents = amountTotal;

    if (!email) {
      result.skippedNoEmail += 1;
      result.skipped += 1;
      continue;
    }

    if (amountCents <= 0) {
      result.skipped += 1;
      continue;
    }

    const { data: existing } = await supabase
      .from("recovered_stripe_sessions")
      .select("session_id")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (existing) {
      result.skippedAlreadyRecovered += 1;
      result.skipped += 1;
      continue;
    }

    if (dryRun) {
      result.processed += 1;
      continue;
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, balance, total_deposits")
      .eq("email", email)
      .single();

    if (userError || !user) {
      result.skippedUserNotFound += 1;
      result.skipped += 1;
      result.errors.push(`User not found: ${email}`);
      continue;
    }

    const newTotalDeposits = (Number(user.total_deposits) || 0) + amountCents;
    const newBalance = (Number(user.balance) || 0) + amountCents;

    const { error: updateError } = await supabase
      .from("users")
      .update({
        balance: newBalance,
        total_deposits: newTotalDeposits,
      })
      .eq("email", email);

    if (updateError) {
      result.errors.push(`${email}: ${updateError.message}`);
      continue;
    }

    const { error: insertError } = await supabase.from("recovered_stripe_sessions").insert({
      session_id: sessionId,
      user_id: user.id,
      amount: amountCents,
    });

    if (insertError) {
      result.errors.push(`Record recovery for ${sessionId}: ${insertError.message}`);
    }

    result.processed += 1;
  }

  return NextResponse.json({
    message: dryRun ? "Dry run — no balances updated" : "Recovery complete",
    ...result,
  });
}
