import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

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
    const mode = session.mode;

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    if (mode === "payment" && amountTotal > 0) {
      const amountCents = Math.round(amountTotal);
      const { data: userRow } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      const userId = (userRow as { id?: string } | null)?.id;
      if (userId) {
        await supabase.rpc("increment_user_balance", {
          p_user_id: userId,
          p_amount_cents: amountCents,
        });
      }

      await supabase.rpc("increment_wallet_balance", {
        p_email: email,
        p_amount_cents: amountCents,
      });
    }

    if (mode === "subscription" && email) {
      await supabase
        .from("users")
        .update({ membership: "active", updated_at: new Date().toISOString() })
        .eq("email", email);
    }
  }

  return NextResponse.json({ received: true });
}
