/**
 * RECOVER ALL STRIPE PAYMENTS AND CREDIT USER BALANCES
 *
 * Run with: node --env-file=.env.local scripts/recover-payments.cjs
 * Or:        node scripts/recover-payments.cjs   (uses .env.local via dotenv)
 *
 * Uses Stripe secret key, fetches all paid checkout sessions,
 * finds users by email in Supabase, credits users.balance and total_deposits,
 * inserts transactions (type=deposit, source=stripe_recovery), prevents duplicates.
 * Returns summary: recovered count, total amount.
 */

require("dotenv").config({ path: ".env.local" });
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const STRIPE_SECRET = (process.env.STRIPE_SECRET_KEY || "").trim().replace(/^["']|["']$/g, "");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STRIPE_SECRET || !STRIPE_SECRET.startsWith("sk_")) {
  console.error("Set STRIPE_SECRET_KEY in .env.local");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2026-01-28.clover" });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function recoverAll() {
  const sessions = [];
  let hasMore = true;
  let startingAfter;

  console.log("Fetching all Stripe checkout sessions...");
  while (hasMore) {
    const list = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter && { starting_after: startingAfter }),
    });
    sessions.push(...list.data);
    hasMore = list.has_more;
    if (list.data.length > 0) {
      startingAfter = list.data[list.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  const paid = sessions.filter((s) => s.payment_status === "paid");
  console.log("Paid sessions:", paid.length);

  let recovered = 0;
  let totalAmountCents = 0;

  for (const session of paid) {
    const sessionId = session.id;
    const amountTotal = session.amount_total ?? 0;
    if (amountTotal <= 0) continue;

    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("reference_id", sessionId)
      .eq("type", "deposit")
      .maybeSingle();
    if (existingTx) continue;

    const { data: existingSp } = await supabase
      .from("stripe_payments")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (existingSp) continue;

    const customerEmail =
      session.customer_email ||
      session.metadata?.email ||
      "";
    let userId =
      session.metadata?.user_id ||
      session.metadata?.userId ||
      session.client_reference_id ||
      null;

    if (!userId && customerEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", customerEmail)
        .maybeSingle();
      if (profile?.id) userId = profile.id;
      if (!userId) {
        const { data: user } = await supabase
          .from("users")
          .select("id")
          .eq("email", customerEmail)
          .maybeSingle();
        if (user?.id) userId = user.id;
      }
    }

    if (!userId) {
      console.log("Skip (no user):", sessionId, customerEmail || "(no email)");
      continue;
    }

    const amountDollars = amountTotal / 100;

    await supabase.from("stripe_payments").insert({
      stripe_session_id: sessionId,
      user_id: userId,
      email: customerEmail || "unknown",
      amount: amountDollars,
      currency: (session.currency || "usd").toLowerCase(),
      status: "completed",
      created_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error && error.code !== "23505") console.error("stripe_payments:", error.message);
    });

    const txRow = {
      user_id: userId,
      type: "deposit",
      amount: amountTotal,
      status: "completed",
      description: `Stripe recovery ${sessionId}`,
      reference_id: sessionId,
      source: "stripe_recovery",
    };
    const { error: txErr } = await supabase.from("transactions").insert(txRow);
    if (txErr) {
      if (txErr.code === "42703") {
        await supabase.from("transactions").insert({
          user_id: userId,
          type: "deposit",
          amount: amountTotal,
          status: "completed",
          description: `Stripe recovery ${sessionId}`,
          reference_id: sessionId,
        }).then(({ error: e }) => {
          if (e && e.code !== "23505") console.error("transactions:", e.message);
        });
      } else if (txErr.code !== "23505") {
        console.error("transactions insert:", txErr.message);
        continue;
      }
    }

    const { data: existingDep } = await supabase
      .from("deposits")
      .select("id")
      .or(`stripe_session.eq.${sessionId},stripe_session_id.eq.${sessionId}`)
      .maybeSingle();
    if (!existingDep) {
      await supabase.from("deposits").insert({
        user_id: userId,
        amount: amountDollars,
        stripe_session: sessionId,
        stripe_session_id: sessionId,
        status: "completed",
      }).then(({ error }) => { if (error) console.error("deposits:", error.message); });
    }

    const { data: u } = await supabase.from("users").select("balance, total_deposits").eq("id", userId).maybeSingle();
    const cur = u || {};
    await supabase
      .from("users")
      .update({
        balance: Number(cur.balance ?? 0) + amountTotal,
        total_deposits: Number(cur.total_deposits ?? 0) + amountTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    recovered += 1;
    totalAmountCents += amountTotal;
    console.log("Recovered:", sessionId, "user:", userId, "amount:", amountDollars.toFixed(2), "USD");
  }

  console.log("\n--- Summary ---");
  console.log("Recovered count:", recovered);
  console.log("Total amount (cents):", totalAmountCents);
  console.log("Total amount (USD):", (totalAmountCents / 100).toFixed(2));
  return { recovered, totalAmountCents };
}

recoverAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
