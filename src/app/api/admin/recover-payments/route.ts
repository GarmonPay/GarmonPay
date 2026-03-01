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
    const metadataUserId = typeof session.metadata?.user_id === "string"
      ? session.metadata.user_id
      : (typeof session.client_reference_id === "string" ? session.client_reference_id : null);
    const amountCents = session.amount_total ?? 0;

    if (!email && !metadataUserId) {
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

    let userQuery = supabase
      .from("users")
      .select("id, balance, total_deposits")
      .limit(1);
    if (metadataUserId) {
      userQuery = userQuery.eq("id", metadataUserId);
    } else {
      userQuery = userQuery.eq("email", email);
    }
    const { data: user, error: userError } = await userQuery.single();

    if (userError || !user) {
      result.skippedUserNotFound += 1;
      result.skipped += 1;
      result.errors.push(`User not found: ${metadataUserId ?? email}`);
      continue;
    }

    const newBalance = (Number(user.balance) || 0) + amountCents;
    const newTotalDeposits = (Number(user.total_deposits) || 0) + amountCents;

    let { error: updateError } = await supabase
      .from("users")
      .update({
        balance: newBalance,
        total_deposits: newTotalDeposits,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (updateError && updateError.message?.toLowerCase().includes("total_deposits")) {
      const retry = await supabase
        .from("users")
        .update({
          balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      updateError = retry.error;
    }

    if (updateError) {
      result.errors.push(`${metadataUserId ?? email ?? user.id}: ${updateError.message}`);
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

    try {
      const { data: existingTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("type", "deposit")
        .eq("reference_id", sessionId)
        .maybeSingle();
      if (!existingTx) {
        await supabase.from("transactions").insert({
          user_id: user.id,
          type: "deposit",
          amount: amountCents,
          status: "completed",
          description: `Recovered Stripe checkout ${sessionId}`,
          reference_id: sessionId,
        });
      }
    } catch (txErr) {
      const message = txErr instanceof Error ? txErr.message : "Unknown transaction recovery error";
      result.errors.push(`Transaction recovery ${sessionId}: ${message}`);
    }

    try {
      const { error: depositError } = await supabase.from("deposits").insert({
        user_id: user.id,
        amount: amountCents / 100,
        status: "completed",
        stripe_session: sessionId,
        created_at: new Date().toISOString(),
      });
      if (depositError && (depositError as { code?: string }).code !== "23505") {
        result.errors.push(`Deposit record ${sessionId}: ${depositError.message}`);
      }
    } catch {
      // deposits table may differ between environments; transactions remain source of truth.
    }

    result.processed += 1;
  }

  return NextResponse.json({
    message: dryRun ? "Dry run — no balances updated" : "Recovery complete",
    ...result,
  });
}
