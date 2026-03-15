import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import { recordRevenue } from "@/lib/platform-balance";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import { grantDepositBonus } from "@/lib/viral-referral-db";
import Stripe from "stripe";

/**
 * Stripe webhook — use this URL in Stripe Dashboard (Developers → Webhooks):
 *   https://garmonpay.com/api/stripe/webhook
 * Do not use the file path (e.g. .../src/app/api/stripe/webhook/route.ts).
 */
export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim().replace(/^["']|["']$/g, "").split("\n")[0]?.trim() ?? "";

export async function GET() {
  return NextResponse.json({ status: "live" });
}

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    console.error("[Stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Webhook secret missing", { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    console.error("[Stripe webhook] Missing stripe-signature header");
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const arrayBuffer = await req.arrayBuffer();
  const body = Buffer.from(arrayBuffer);

  let event: Stripe.Event;
  try {
    if (!isStripeConfigured()) {
      console.error("[Stripe webhook] STRIPE_SECRET_KEY is not set");
      return new Response("Stripe not configured", { status: 503 });
    }
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[Stripe webhook] Signature verification error:", message);
    return new Response(message, { status: 400 });
  }

  const eventId = event.id;
  const eventType = event.type;

  if (eventType === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    console.warn("[Stripe webhook] payment_intent.payment_failed", {
      eventId,
      paymentIntentId: pi.id,
      amount: pi.amount,
      lastError: pi.last_payment_error?.message,
    });
    return new Response("OK", { status: 200 });
  }

  if (eventType === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const supabasePi = createAdminClient();
    if (!supabasePi) return new Response("OK", { status: 200 });
    const { data: existingTx } = await supabasePi.from("transactions").select("id").eq("reference_id", pi.id).eq("type", "deposit").maybeSingle();
    if (existingTx) return new Response("OK", { status: 200 });
    const { data: existingSp } = await supabasePi.from("stripe_payments").select("id").eq("stripe_payment_intent_id", pi.id).maybeSingle();
    if (existingSp) return new Response("OK", { status: 200 });
    const amountTotal = pi.amount ?? 0;
    if (amountTotal <= 0) return new Response("OK", { status: 200 });
    const metadata = (pi.metadata ?? {}) as Record<string, string>;
    let user_id_pi: string | null = metadata?.user_id ?? metadata?.userId ?? null;
    const customerEmail = (metadata?.email as string) ?? "";
    if (!user_id_pi && customerEmail) {
      const { data: u } = await supabasePi.from("users").select("id").eq("email", customerEmail).maybeSingle();
      if (u && (u as { id?: string }).id) user_id_pi = (u as { id: string }).id;
      if (!user_id_pi) {
        const { data: p } = await supabasePi.from("profiles").select("id").eq("email", customerEmail).maybeSingle();
        if (p && (p as { id?: string }).id) user_id_pi = (p as { id: string }).id;
      }
    }
    if (!user_id_pi) {
      console.warn("[Stripe webhook] payment_intent.succeeded no user", { eventId, paymentIntentId: pi.id });
      return new Response("OK", { status: 200 });
    }
    const ledgerResult = await walletLedgerEntry(user_id_pi, "deposit", amountTotal, `stripe_pi_${pi.id}`);
    if (ledgerResult.success) {
      const { data: uRow } = await supabasePi.from("users").select("total_deposits").eq("id", user_id_pi).single();
      const prevTotal = Number((uRow as { total_deposits?: number })?.total_deposits ?? 0);
      await supabasePi.from("users").update({ total_deposits: prevTotal + amountTotal, updated_at: new Date().toISOString() }).eq("id", user_id_pi);
      await supabasePi.from("transactions").insert({ user_id: user_id_pi, type: "deposit", amount: amountTotal, status: "completed", description: `Stripe payment_intent ${pi.id}`, reference_id: pi.id, stripe_session: pi.id }).then(({ error }) => { if (error) console.error("[Stripe webhook] payment_intent.succeeded tx insert:", error.message); });
      await supabasePi.from("stripe_payments").insert({ user_id: user_id_pi, email: customerEmail || "unknown", amount: amountTotal / 100, currency: (pi.currency ?? "usd").toLowerCase(), status: "completed", stripe_payment_intent_id: pi.id, session_id: pi.id }).then(({ error }) => { if (error) console.error("[Stripe webhook] payment_intent.succeeded stripe_payments insert:", error.message); });
      recordRevenue(amountTotal, "stripe").catch((e) => console.error("[Stripe webhook] platform_record_revenue:", e));
      grantDepositBonus(user_id_pi).then((r) => { if (r.granted) console.log("[Stripe webhook] Referrer deposit bonus granted for", user_id_pi); });
      console.log("[Stripe webhook] payment_intent.succeeded credited via ledger", { eventId, user_id: user_id_pi, amountTotal });
      return new Response("OK", { status: 200 });
    }
    const { data: newBalance } = await supabasePi.rpc("increment_user_balance", { uid: user_id_pi, amount: amountTotal });
    if (newBalance != null) {
      const { data: uRow } = await supabasePi.from("users").select("total_deposits").eq("id", user_id_pi).single();
      const prevTotal = Number((uRow as { total_deposits?: number })?.total_deposits ?? 0);
      await supabasePi.from("users").update({ total_deposits: prevTotal + amountTotal, updated_at: new Date().toISOString() }).eq("id", user_id_pi);
      await supabasePi.from("transactions").insert({ user_id: user_id_pi, type: "deposit", amount: amountTotal, status: "completed", description: `Stripe payment_intent ${pi.id}`, reference_id: pi.id, stripe_session: pi.id }).then(({ error }) => { if (error) console.error("[Stripe webhook] payment_intent.succeeded tx insert:", error.message); });
      await supabasePi.from("stripe_payments").insert({ user_id: user_id_pi, email: customerEmail || "unknown", amount: amountTotal / 100, currency: (pi.currency ?? "usd").toLowerCase(), status: "completed", stripe_payment_intent_id: pi.id, session_id: pi.id }).then(({ error }) => { if (error) console.error("[Stripe webhook] payment_intent.succeeded stripe_payments insert:", error.message); });
      recordRevenue(amountTotal, "stripe").catch((e) => console.error("[Stripe webhook] platform_record_revenue:", e));
      grantDepositBonus(user_id_pi).then((r) => { if (r.granted) console.log("[Stripe webhook] Referrer deposit bonus granted for", user_id_pi); });
      console.log("[Stripe webhook] payment_intent.succeeded credited via increment_user_balance", { eventId, user_id: user_id_pi, amountTotal });
      return new Response("OK", { status: 200 });
    }
    const { data: userRowPi } = await supabasePi.from("users").select("balance, total_deposits").eq("id", user_id_pi).maybeSingle();
    const cur = (userRowPi as { balance?: number; total_deposits?: number } | null) ?? {};
    const newBal = Number(cur.balance ?? 0) + amountTotal;
    const newTotalDeposits = Number(cur.total_deposits ?? 0) + amountTotal;
    await supabasePi.from("users").update({ balance: newBal, total_deposits: newTotalDeposits, updated_at: new Date().toISOString() }).eq("id", user_id_pi);
    await supabasePi.from("transactions").insert({ user_id: user_id_pi, type: "deposit", amount: amountTotal, status: "completed", description: `Stripe payment_intent ${pi.id}`, reference_id: pi.id, stripe_session: pi.id }).then(({ error }) => { if (error) console.error("[Stripe webhook] payment_intent.succeeded tx insert:", error.message); });
    await supabasePi.from("stripe_payments").insert({ user_id: user_id_pi, email: customerEmail || "unknown", amount: amountTotal / 100, currency: (pi.currency ?? "usd").toLowerCase(), status: "completed", stripe_payment_intent_id: pi.id, session_id: pi.id }).then(({ error }) => { if (error) console.error("[Stripe webhook] payment_intent.succeeded stripe_payments insert:", error.message); });
    recordRevenue(amountTotal, "stripe").catch((e) => console.error("[Stripe webhook] platform_record_revenue:", e));
    console.log("[Stripe webhook] payment_intent.succeeded credited (fallback)", { eventId, user_id: user_id_pi, amountTotal });
    return new Response("OK", { status: 200 });
  }

  const supabaseForWebhook = createAdminClient();

  if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription & { current_period_end?: number };
    const productType = (sub.metadata?.product_type as string) || "";
    if (productType !== "arena_season_pass" || !supabaseForWebhook) return new Response("OK", { status: 200 });
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
    const status = eventType === "customer.subscription.deleted" ? "canceled" : sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "canceled";
    const userId = (sub.metadata?.user_id as string) || null;
    if (userId) {
      await supabaseForWebhook.from("arena_season_pass").update({ status, current_period_end: periodEnd, updated_at: new Date().toISOString() }).eq("stripe_subscription_id", sub.id);
    } else {
      const { data: existing } = await supabaseForWebhook.from("arena_season_pass").select("id").eq("stripe_subscription_id", sub.id).maybeSingle();
      if (existing) {
        await supabaseForWebhook.from("arena_season_pass").update({ status, current_period_end: periodEnd, updated_at: new Date().toISOString() }).eq("stripe_subscription_id", sub.id);
      }
    }
    return new Response("OK", { status: 200 });
  }

  if (eventType !== "checkout.session.completed") {
    return new Response("OK", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const amount_total = session.amount_total ?? 0;

  if (session.payment_status !== "paid" || amount_total <= 0) {
    return new Response("OK", { status: 200 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    console.error("[Stripe webhook] Supabase admin client unavailable");
    return new Response("Database unavailable", { status: 500 });
  }

  const { data: existingPayment } = await supabase.from("stripe_payments").select("id").eq("stripe_session_id", session.id).maybeSingle();
  if (existingPayment) {
    return new Response("OK", { status: 200 });
  }

  let user_id: string | null =
    (session.metadata?.user_id ?? session.metadata?.userId ?? session.client_reference_id) as string | null;

  const customer_email =
    (session.customer_email as string) ?? (session.metadata?.email as string) ?? "";

  if (!user_id) {
    const customer_email =
      (session.customer_email as string) ??
      (session.metadata?.email as string) ??
      "";
    if (customer_email) {
      const { data: userRow } = await supabase.from("users").select("id").eq("email", customer_email).maybeSingle();
      if (userRow && typeof (userRow as { id?: string }).id === "string") {
        user_id = (userRow as { id: string }).id;
      }
    }
    if (!user_id) {
      const { data: profileRow } = await supabase.from("profiles").select("id").eq("email", customer_email).maybeSingle();
      if (profileRow && typeof (profileRow as { id?: string }).id === "string") {
        user_id = (profileRow as { id: string }).id;
      }
    }
  }

  if (!user_id) {
    console.error("[Stripe webhook] No user_id for session:", session.id);
    return new Response("OK", { status: 200 });
  }

  const session_id = session.id;
  const amount_dollars = amount_total / 100;
  const product_type = (session.metadata?.product_type as string) || "payment";

  if (product_type === "arena_store") {
    const store_item_id = session.metadata?.store_item_id as string | undefined;
    const fighter_id = session.metadata?.fighter_id as string | undefined;
    if (store_item_id && fighter_id && supabase) {
      const { data: item } = await supabase.from("arena_store_items").select("id, effect_class, name").eq("id", store_item_id).maybeSingle();
      if (item) {
        const effectClass = (item as { effect_class?: string }).effect_class;
        if (effectClass === "coins") {
          const addCoins = amount_dollars >= 7.99 ? 1200 : amount_dollars >= 3.99 ? 500 : 100;
          const { data: u } = await supabase.from("users").select("arena_coins").eq("id", user_id).single();
          const current = Number((u as { arena_coins?: number })?.arena_coins ?? 0);
          await supabase.from("users").update({ arena_coins: current + addCoins }).eq("id", user_id);
          await supabase.from("arena_coin_transactions").insert({
            user_id,
            amount: addCoins,
            type: "stripe_purchase",
            description: `Purchased ${addCoins} Arena Coins`,
          });
        } else if (effectClass === "recovery" || effectClass === "title") {
          const { data: f } = await supabase.from("arena_fighters").select("id").eq("id", fighter_id).eq("user_id", user_id).maybeSingle();
          if (f) {
            if (effectClass === "recovery") {
              await supabase.from("arena_fighters").update({ condition: "fresh", updated_at: new Date().toISOString() }).eq("id", fighter_id);
            } else {
              await supabase.from("arena_fighters").update({ title: (item as { name?: string }).name ?? "Title", updated_at: new Date().toISOString() }).eq("id", fighter_id);
            }
          }
        } else {
          const { data: f } = await supabase.from("arena_fighters").select("id").eq("id", fighter_id).eq("user_id", user_id).maybeSingle();
          if (f) {
            await supabase.from("arena_fighter_inventory").insert({ fighter_id, store_item_id });
          }
        }
        await supabase.from("arena_admin_earnings").insert({
          source_type: "store",
          source_id: fighter_id,
          amount: amount_dollars,
        });
      }
    }
    await supabase.from("stripe_payments").insert({
      user_id,
      email: (session.customer_email as string) || "unknown",
      amount: amount_dollars,
      currency: "usd",
      product_type: "arena_store",
      stripe_session_id: session_id,
      session_id: session_id,
      status: "completed",
    }).then(({ error }) => { if (error) console.error("[Stripe webhook] stripe_payments arena_store:", error.message); });
    return new Response("OK", { status: 200 });
  }

  if (product_type === "arena_season_pass" && session.mode === "subscription" && session.subscription && supabase) {
    const stripe = getStripe();
    const subId = typeof session.subscription === "string" ? session.subscription : (session.subscription as Stripe.Subscription).id;
    const sub = await stripe.subscriptions.retrieve(subId) as Stripe.Subscription & { current_period_end?: number };
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
    const subStatus = sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "canceled";
    await supabase.from("arena_season_pass").upsert(
      {
        user_id,
        stripe_subscription_id: sub.id,
        status: subStatus,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    await supabase.from("arena_admin_earnings").insert({ source_type: "season_pass", source_id: user_id, amount: 9.99 });
    await supabase.from("stripe_payments").insert({
      user_id,
      email: (session.customer_email as string) || "unknown",
      amount: 9.99,
      currency: "usd",
      product_type: "arena_season_pass",
      stripe_session_id: session_id,
      session_id: session_id,
      status: "completed",
    }).then(({ error }) => { if (error) console.error("[Stripe webhook] stripe_payments arena_season_pass:", error.message); });
    return new Response("OK", { status: 200 });
  }

  const ledgerResult = await walletLedgerEntry(user_id, "deposit", amount_total, `stripe_session_${session_id}`);
  if (ledgerResult.success) {
    const { data: uRow } = await supabase.from("users").select("total_deposits").eq("id", user_id).single();
    const prevTotal = Number((uRow as { total_deposits?: number })?.total_deposits ?? 0);
    await supabase.from("users").update({ total_deposits: prevTotal + amount_total, updated_at: new Date().toISOString() }).eq("id", user_id);
    console.log("[Stripe webhook] Balance credited via ledger — user_id:", user_id, "amount_cents:", amount_total, "eventId:", eventId);
  } else {
    const { data: newBalance } = await supabase.rpc("increment_user_balance", { uid: user_id, amount: amount_total });
    if (newBalance != null) {
      const { data: uRow } = await supabase.from("users").select("total_deposits").eq("id", user_id).single();
      const prevTotal = Number((uRow as { total_deposits?: number })?.total_deposits ?? 0);
      await supabase.from("users").update({ total_deposits: prevTotal + amount_total, updated_at: new Date().toISOString() }).eq("id", user_id);
      console.log("[Stripe webhook] Balance credited via increment_user_balance — user_id:", user_id, "amount_cents:", amount_total, "eventId:", eventId);
    } else {
      const { data: userRow } = await supabase.from("users").select("balance, total_deposits").eq("id", user_id).maybeSingle();
      const currentBalance = Number((userRow as { balance?: number } | null)?.balance ?? 0);
      const currentTotalDeposits = Number((userRow as { total_deposits?: number } | null)?.total_deposits ?? 0);
      const newBalance = currentBalance + amount_total;
      const newTotalDeposits = currentTotalDeposits + amount_total;
      const { error: balanceErr } = await supabase
        .from("users")
        .update({ balance: newBalance, total_deposits: newTotalDeposits, updated_at: new Date().toISOString() })
        .eq("id", user_id);
      if (balanceErr) {
        console.error("[Stripe webhook] users.balance update failed:", balanceErr);
        return new Response("Balance update failed", { status: 500 });
      }
      console.log("[Stripe webhook] Balance credited (fallback) — user_id:", user_id, "amount_cents:", amount_total, "eventId:", eventId);
    }
  }

  await supabase.from("transactions").insert({
    user_id,
    type: "deposit",
    amount: amount_total,
    status: "completed",
    description: `Stripe checkout ${session_id}`,
    reference_id: session_id,
    stripe_session: session_id,
  }).then(({ error }) => {
    if (error) console.error("[Stripe webhook] transactions insert:", error.message);
  });

  recordRevenue(amount_total, "stripe").catch((e) => console.error("[Stripe webhook] platform_record_revenue:", e));
  grantDepositBonus(user_id).then((r) => { if (r.granted) console.log("[Stripe webhook] Referrer deposit bonus granted for", user_id); });

  const { data: existingDeposit } = await supabase.from("deposits").select("id").or(`stripe_session.eq.${session_id},stripe_session_id.eq.${session_id}`).maybeSingle();

  if (!existingDeposit) {
    await supabase.from("deposits").insert({
      user_id,
      amount: amount_dollars,
      stripe_session: session_id,
      stripe_session_id: session_id,
      status: "completed",
    }).then(({ error }) => {
      if (error) console.error("[Stripe webhook] deposits insert:", error.message);
    });
  }

  const payment_intent_id =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;

  await supabase.from("stripe_payments").insert({
    user_id,
    email: customer_email || "unknown",
    amount: amount_dollars,
    currency: (session.currency ?? "usd").toLowerCase(),
    product_type: (session.metadata?.product_type as string) || "payment",
    stripe_session_id: session_id,
    session_id: session_id,
    status: "completed",
    ...(payment_intent_id && {
      stripe_payment_intent: payment_intent_id,
      stripe_payment_intent_id: payment_intent_id,
    }),
  }).then(({ error }) => {
    if (error) console.error("[Stripe webhook] stripe_payments insert:", error.message);
  });

  return new Response("OK", { status: 200 });
}
