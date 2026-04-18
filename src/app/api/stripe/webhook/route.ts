import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import { recordRevenue } from "@/lib/platform-balance";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import { creditCoins } from "@/lib/coins";
import { grantMembershipUpgradeBonusGpc } from "@/lib/gpay-bonus-credits";
import { creditReferralUpgradeCommission } from "@/lib/adTracker";
import { createGarmonNotification } from "@/lib/garmon-notifications";
import Stripe from "stripe";
import { MEMBERSHIP_PRICE_ENV_BY_TIER, type PaidMembershipTier } from "@/lib/membership-price-ids";
import { getGoldCoinPackage } from "@/lib/gold-coin-packages";

/**
 * Stripe webhook — use this URL in Stripe Dashboard (Developers → Webhooks):
 *   https://garmonpay.com/api/stripe/webhook
 * Do not use the file path (e.g. .../src/app/api/stripe/webhook/route.ts).
 *
 * Wallet USD top-up: `checkout.session.completed` credits `wallet_balances` exactly once via
 * `wallet_ledger_entry` (reference `stripe_session_<session.id>`). Reporting rows
 * (`transactions`, `deposits`, `stripe_payments`) are best-effort; replays backfill without
 * double-counting `total_deposits` / platform revenue when the ledger row already exists.
 */
export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim().replace(/^["']|["']$/g, "").split("\n")[0]?.trim() ?? "";

function tierFromPriceId(priceId: string | null | undefined): PaidMembershipTier | null {
  const normalized = (priceId ?? "").trim();
  if (!normalized) return null;
  const entries = Object.entries(MEMBERSHIP_PRICE_ENV_BY_TIER) as [PaidMembershipTier, string][];
  for (const [tier, envName] of entries) {
    const envValue = process.env[envName]?.trim();
    if (envValue && envValue === normalized) return tier;
  }
  return null;
}

async function safeMembershipUpdate(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  payload: {
    membership: string;
    stripe_subscription_id?: string | null;
    subscription_status?: string | null;
    membership_tier?: string | null;
    membership_expires_at?: string | null;
    membership_payment_source?: string | null;
  }
) {
  const now = new Date().toISOString();
  const tier = payload.membership_tier ?? payload.membership;
  const extended = await supabase
    .from("users")
    .update({
      membership: payload.membership,
      membership_tier: tier,
      stripe_subscription_id: payload.stripe_subscription_id ?? null,
      subscription_status: payload.subscription_status ?? "active",
      membership_expires_at: payload.membership_expires_at ?? null,
      membership_payment_source: payload.membership_payment_source ?? null,
      updated_at: now,
    })
    .eq("id", userId);
  if (!extended.error) return;
  await supabase
    .from("users")
    .update({
      membership: payload.membership,
      membership_tier: tier,
      updated_at: now,
    })
    .eq("id", userId);
}

/**
 * After a successful `wallet_ledger_entry` deposit for Stripe Checkout, mirror rows into
 * reporting tables. Safe to call on webhook retries when `incrementUserTotalDeposits` /
 * `recordStripeRevenue` are false (ledger already credited; avoid double-counting).
 */
async function finalizeWalletDepositReporting(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  params: {
    user_id: string;
    session_id: string;
    amount_total: number;
    amount_dollars: number;
    customer_email: string;
    product_type_label: string;
    payment_intent_id: string | null;
    currency: string;
    incrementUserTotalDeposits: boolean;
    recordStripeRevenue: boolean;
  }
): Promise<void> {
  const {
    user_id,
    session_id,
    amount_total,
    amount_dollars,
    customer_email,
    product_type_label,
    payment_intent_id,
    currency,
    incrementUserTotalDeposits,
    recordStripeRevenue,
  } = params;

  if (incrementUserTotalDeposits) {
    const { data: uRow } = await supabase.from("users").select("total_deposits").eq("id", user_id).single();
    const prevTotal = Number((uRow as { total_deposits?: number })?.total_deposits ?? 0);
    await supabase
      .from("users")
      .update({ total_deposits: prevTotal + amount_total, updated_at: new Date().toISOString() })
      .eq("id", user_id);
  }

  const { data: existingTx } = await supabase
    .from("transactions")
    .select("id")
    .eq("reference_id", session_id)
    .eq("type", "deposit")
    .maybeSingle();
  if (!existingTx) {
    const { error } = await supabase.from("transactions").insert({
      user_id,
      type: "deposit",
      amount: amount_total,
      status: "completed",
      description: `Stripe checkout ${session_id}`,
      reference_id: session_id,
      stripe_session: session_id,
    });
    if (error) console.error("[Stripe webhook] transactions insert:", error.message);
  }

  if (recordStripeRevenue) {
    recordRevenue(amount_total, "stripe").catch((e) => console.error("[Stripe webhook] platform_record_revenue:", e));
  }

  const { data: existingDeposit } = await supabase
    .from("deposits")
    .select("id")
    .or(`stripe_session.eq.${session_id},stripe_session_id.eq.${session_id}`)
    .maybeSingle();
  if (!existingDeposit) {
    const { error } = await supabase.from("deposits").insert({
      user_id,
      amount: amount_dollars,
      stripe_session: session_id,
      stripe_session_id: session_id,
      status: "completed",
    });
    if (error) console.error("[Stripe webhook] deposits insert:", error.message);
  }

  const { data: existingSp } = await supabase.from("stripe_payments").select("id").eq("stripe_session_id", session_id).maybeSingle();
  if (!existingSp) {
    const { error } = await supabase.from("stripe_payments").insert({
      user_id,
      email: customer_email || "unknown",
      amount: amount_dollars,
      currency: currency.toLowerCase(),
      product_type: product_type_label,
      stripe_session_id: session_id,
      session_id: session_id,
      status: "completed",
      ...(payment_intent_id && {
        stripe_payment_intent: payment_intent_id,
        stripe_payment_intent_id: payment_intent_id,
      }),
    });
    if (error) console.error("[Stripe webhook] stripe_payments insert:", error.message);
  }
}

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
    // Wallet deposits are credited once in checkout.session.completed via walletLedgerEntry.
    // Handling PI here too would double-credit Checkout Session payments (same charge, two events).
    console.log("[Stripe webhook] payment_intent.succeeded (wallet via checkout.session only)", {
      eventId,
      paymentIntentId: pi.id,
    });
    return new Response("OK", { status: 200 });
  }

  const supabaseForWebhook = createAdminClient();

  if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription & { current_period_end?: number };
    const productType = (sub.metadata?.product_type as string) || "";
    if (productType === "membership_upgrade" && supabaseForWebhook) {
      const userId = (sub.metadata?.user_id as string) || null;
      const tier = ((sub.metadata?.membership_tier as string) || (sub.metadata?.tier as string) || "starter").toLowerCase();
      if (userId) {
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        await safeMembershipUpdate(supabaseForWebhook, userId, {
          membership: tier,
          membership_tier: tier,
          stripe_subscription_id: sub.id,
          subscription_status: eventType === "customer.subscription.deleted" ? "canceled" : sub.status,
          membership_expires_at: periodEnd,
          membership_payment_source: "stripe",
        });
      }
      return new Response("OK", { status: 200 });
    }
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

  if (product_type === "membership_upgrade" && session.mode === "subscription") {
    const stripe = getStripe();
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    const first = lineItems.data[0];
    const linePriceId = typeof first?.price === "string" ? first.price : first?.price?.id ?? null;
    const tierFromPrice = tierFromPriceId(linePriceId);
    const tierFromMeta = ((session.metadata?.membership_tier as string) || (session.metadata?.tier as string) || "").toLowerCase();
    const targetTier =
      tierFromPrice ??
      (["starter", "growth", "pro", "elite"].includes(tierFromMeta)
        ? (tierFromMeta as PaidMembershipTier)
        : null);

    if (!targetTier) {
      console.error("[Stripe webhook] membership_upgrade unknown tier", { sessionId: session.id, linePriceId, tierFromMeta });
      return new Response("OK", { status: 200 });
    }

    const subId =
      typeof session.subscription === "string"
        ? session.subscription
        : ((session.subscription as Stripe.Subscription | null)?.id ?? null);

    await safeMembershipUpdate(supabase, user_id, {
      membership: targetTier,
      membership_tier: targetTier,
      stripe_subscription_id: subId,
      subscription_status: "active",
      membership_expires_at: null,
      membership_payment_source: "stripe",
    });

    const bonusRes = await grantMembershipUpgradeBonusGpc(user_id, targetTier, session_id);
    if (!bonusRes.ok) {
      console.error("[Stripe webhook] membership upgrade GPC bonus failed", { user_id, targetTier, session_id });
    }

    await supabase.from("transactions").insert({
      user_id,
      type: "membership_upgrade",
      amount: amount_total,
      status: "completed",
      description: `Membership upgrade to ${targetTier}`,
      reference_id: session_id,
      stripe_session: session_id,
    });

    const { data: existingUpgradeCommission } = await supabase
      .from("transactions")
      .select("id")
      .eq("reference_id", `referral_upgrade_${user_id}`)
      .maybeSingle();

    if (!existingUpgradeCommission) {
      await creditReferralUpgradeCommission({
        upgradedUserId: user_id,
        upgradePlan: targetTier,
        upgradePriceCents: amount_total,
        stripeSessionId: session_id,
        stripeSubscriptionId: subId,
      });
    }

    await supabase.from("stripe_payments").insert({
      user_id,
      email: customer_email || "unknown",
      amount: amount_dollars,
      currency: (session.currency ?? "usd").toLowerCase(),
      product_type: "membership_upgrade",
      stripe_session_id: session_id,
      session_id,
      status: "completed",
    }).then(({ error }) => {
      if (error) console.error("[Stripe webhook] stripe_payments membership_upgrade:", error.message);
    });

    recordRevenue(amount_total, "stripe").catch((e) => console.error("[Stripe webhook] platform_record_revenue:", e));
    return new Response("OK", { status: 200 });
  }

  if (product_type === "ad_deposit") {
    const ad_id = session.metadata?.ad_id as string | undefined;
    const amount_dollars_meta = parseFloat((session.metadata?.amount_dollars as string) ?? "0");
    const deposit_amount = Number.isFinite(amount_dollars_meta) && amount_dollars_meta > 0 ? amount_dollars_meta : amount_dollars;
    if (ad_id && supabase && deposit_amount >= 5) {
      const { data: adRow } = await supabase.from("garmon_ads").select("id, user_id, remaining_budget, total_budget, status").eq("id", ad_id).maybeSingle();
      if (adRow && (adRow as { user_id: string }).user_id === user_id) {
        const ad = adRow as { remaining_budget: number; total_budget: number; status: string };
        const newRemaining = Number(ad.remaining_budget) + deposit_amount;
        const newTotal = Number(ad.total_budget) + deposit_amount;
        const wasPending = ad.status === "pending";
        const updates: { remaining_budget: number; total_budget: number; updated_at: string } = {
          remaining_budget: newRemaining,
          total_budget: newTotal,
          updated_at: new Date().toISOString(),
        };
        await supabase.from("garmon_ads").update(updates).eq("id", ad_id);
        await supabase.from("stripe_payments").insert({
          user_id,
          email: customer_email || "unknown",
          amount: deposit_amount,
          currency: "usd",
          product_type: "ad_deposit",
          stripe_session_id: session_id,
          session_id: session_id,
          status: "completed",
        }).then(({ error }) => { if (error) console.error("[Stripe webhook] stripe_payments ad_deposit:", error.message); });
        recordRevenue(amount_total, "stripe").catch((e) => console.error("[Stripe webhook] platform_record_revenue:", e));
        if (wasPending) {
          createGarmonNotification(
            user_id,
            "ad_payment_received",
            "Ad payment received",
            `We added $${deposit_amount.toFixed(2)} to your campaign. It will go live after review.`
          ).catch(() => {});
        } else {
          createGarmonNotification(
            user_id,
            "ad_payment_received",
            "Ad budget updated",
            `$${deposit_amount.toFixed(2)} added to your campaign balance.`
          ).catch(() => {});
        }
        console.log("[Stripe webhook] ad_deposit credited", { ad_id, user_id, amount: deposit_amount });
        return new Response("OK", { status: 200 });
      }
    }
    // Do not fall through: ad checkout must never credit the USD wallet ledger.
    console.warn("[Stripe webhook] ad_deposit not applied — no wallet credit", { session_id, user_id });
    return new Response("OK", { status: 200 });
  }

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

  if (product_type === "gold_coin_pack" && supabase) {
    const packageId = String(session.metadata?.package_id ?? "").trim();
    const pkg = getGoldCoinPackage(packageId);
    const goldFromMeta = parseInt(String(session.metadata?.gold_coins ?? "0"), 10);
    const goldCoins = pkg ? pkg.gold_coins : Number.isFinite(goldFromMeta) ? goldFromMeta : 0;
    const pkgLabel = pkg?.stripe_description ?? "Gold Coins pack";

    if (goldCoins <= 0) {
      console.error("[Stripe webhook] gold_coin_pack invalid amount", { session_id, packageId });
      return new Response("OK", { status: 200 });
    }

    const ref = `stripe_gold_pack_${session_id}`;
    const cr = await creditCoins(
      user_id,
      goldCoins,
      0,
      `Purchased ${pkgLabel}`,
      ref,
      "gold_coin_pack"
    );
    if (!cr.success && !/duplicate/i.test(cr.message ?? "")) {
      console.error("[Stripe webhook] gold_coin_pack credit failed", cr.message);
      return new Response("Coin credit failed", { status: 500 });
    }

    await supabase
      .from("platform_earnings")
      .insert({
        source: "gold_coin_pack",
        source_id: packageId || session_id,
        amount_cents: amount_total,
        description: `Gold Coins: ${pkgLabel}`,
        user_id,
      })
      .then(({ error }) => {
        if (error) console.error("[Stripe webhook] platform_earnings gold_coin_pack:", error.message);
      });

    await supabase
      .from("stripe_payments")
      .insert({
        user_id,
        email: customer_email || "unknown",
        amount: amount_dollars,
        currency: (session.currency ?? "usd").toLowerCase(),
        product_type: "gold_coin_pack",
        stripe_session_id: session_id,
        session_id,
        status: "completed",
      })
      .then(({ error }) => {
        if (error) console.error("[Stripe webhook] stripe_payments gold_coin_pack:", error.message);
      });

    recordRevenue(amount_total, "stripe").catch((e) => console.error("[Stripe webhook] platform_record_revenue gold_coin_pack:", e));
    return new Response("OK", { status: 200 });
  }

  if (product_type === "gc_package" && supabase) {
    const gc_package_id = session.metadata?.gc_package_id as string | undefined;
    const goldMeta = parseInt(String(session.metadata?.gold_coins ?? "0"), 10);
    let goldCoins = Number.isFinite(goldMeta) ? goldMeta : 0;
    let pkgName = (session.metadata?.gc_package_name as string) || "GC package";

    if (gc_package_id) {
      const { data: pkgRow } = await supabase.from("gc_packages").select("name, gold_coins, bonus_gpay_coins").eq("id", gc_package_id).maybeSingle();
      if (pkgRow) {
        const pr = pkgRow as { name?: string; gold_coins?: number; bonus_gpay_coins?: number };
        pkgName = pr.name ?? pkgName;
        goldCoins = Math.floor(Number(pr.gold_coins ?? goldCoins));
      }
    }

    const ref = `stripe_gc_${session_id}`;
    const cr = await creditCoins(
      user_id,
      goldCoins,
      0,
      `Purchased ${pkgName}`,
      ref,
      "gc_purchase"
    );
    if (!cr.success && !/duplicate/i.test(cr.message ?? "")) {
      console.error("[Stripe webhook] gc_package credit failed", cr.message);
      return new Response("Coin credit failed", { status: 500 });
    }

    await supabase
      .from("platform_earnings")
      .insert({
        source: "gc_package",
        source_id: gc_package_id ?? session_id,
        amount_cents: amount_total,
        description: `GC package: ${pkgName}`,
        user_id,
      })
      .then(({ error }) => {
        if (error) console.error("[Stripe webhook] platform_earnings gc_package:", error.message);
      });

    await supabase
      .from("stripe_payments")
      .insert({
        user_id,
        email: customer_email || "unknown",
        amount: amount_dollars,
        currency: (session.currency ?? "usd").toLowerCase(),
        product_type: "gc_package",
        stripe_session_id: session_id,
        session_id,
        status: "completed",
      })
      .then(({ error }) => {
        if (error) console.error("[Stripe webhook] stripe_payments gc_package:", error.message);
      });

    recordRevenue(amount_total, "stripe").catch((e) => console.error("[Stripe webhook] platform_record_revenue gc_package:", e));
    return new Response("OK", { status: 200 });
  }

  const walletLedgerRef = `stripe_session_${session_id}`;
  const payment_intent_id =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;
  const product_type_label = (session.metadata?.product_type as string) || "payment";
  const sessionCurrency = (session.currency ?? "usd").toString();

  const { data: existingLedgerRow } = await supabase
    .from("wallet_ledger")
    .select("id")
    .eq("reference", walletLedgerRef)
    .maybeSingle();

  if (existingLedgerRow) {
    console.log("[Stripe webhook] wallet deposit replay — ledger already credited", { session_id, user_id, eventId });
    await finalizeWalletDepositReporting(supabase, {
      user_id,
      session_id,
      amount_total,
      amount_dollars,
      customer_email,
      product_type_label,
      payment_intent_id,
      currency: sessionCurrency,
      incrementUserTotalDeposits: false,
      recordStripeRevenue: false,
    });
    return new Response("OK", { status: 200 });
  }

  const ledgerResult = await walletLedgerEntry(user_id, "deposit", amount_total, walletLedgerRef);
  if (!ledgerResult.success) {
    const dup = typeof ledgerResult.message === "string" && /duplicate/i.test(ledgerResult.message);
    if (dup) {
      console.log("[Stripe webhook] wallet deposit duplicate ledger ref (retry/race)", { session_id, user_id, eventId });
      await finalizeWalletDepositReporting(supabase, {
        user_id,
        session_id,
        amount_total,
        amount_dollars,
        customer_email,
        product_type_label,
        payment_intent_id,
        currency: sessionCurrency,
        incrementUserTotalDeposits: false,
        recordStripeRevenue: false,
      });
      return new Response("OK", { status: 200 });
    }
    console.error("[Stripe webhook] walletLedgerEntry failed — user_id:", user_id, "amount_cents:", amount_total, "eventId:", eventId, ledgerResult.message);
    return new Response("Ledger credit failed", { status: 500 });
  }

  console.log("[Stripe webhook] Balance credited via ledger — user_id:", user_id, "amount_cents:", amount_total, "eventId:", eventId);
  await finalizeWalletDepositReporting(supabase, {
    user_id,
    session_id,
    amount_total,
    amount_dollars,
    customer_email,
    product_type_label,
    payment_intent_id,
    currency: sessionCurrency,
    incrementUserTotalDeposits: true,
    recordStripeRevenue: true,
  });

  return new Response("OK", { status: 200 });
}
