import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  return NextResponse.json({ status: "live" });
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: "Missing webhook signature or secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.customer_details?.email ?? session.customer_email ?? null;
    const amountTotal = session.amount_total ?? 0;
    const amount = amountTotal / 100;
    const mode = session.mode ?? "payment";

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    if (mode === "payment" && amount > 0 && email) {
      await supabase.rpc("add_funds", {
        user_email: email,
        amount,
      });
    }

    if (mode === "subscription" && email) {
      await supabase
        .from("users")
        .update({ membership: "active", updated_at: new Date().toISOString() })
        .eq("email", email);
    }

    if (email) {
      await supabase.from("revenue_transactions").insert({
        email,
        amount,
        type: mode,
      });
    }
  }

  return NextResponse.json({ received: true });
}
