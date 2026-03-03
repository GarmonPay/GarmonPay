import { NextResponse } from "next/server"
import Stripe from "stripe"
import { headers } from "next/headers"
import { createClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const body = await req.text()
  const signature = headers().get("stripe-signature")!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error("Webhook signature failed:", err.message)
    return new NextResponse("Webhook error", { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session

    const userId = session.metadata?.user_id

    if (!userId) {
      console.error("No user_id in metadata")
      return NextResponse.json({ received: true })
    }

    const amount = (session.amount_total ?? 0) / 100
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null
    const email =
      session.customer_email ??
      (session.customer_details as { email?: string } | null)?.email ??
      null

    console.log("Crediting user:", userId)
    console.log("Amount:", amount)

    // Insert payment record
    await supabase.from("stripe_payments").insert({
      user_id: userId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_payment_intent: paymentIntentId,
      amount,
      email,
      status: "completed",
    })

    // Update user balance
    const { data: user } = await supabase
      .from("users")
      .select("balance, total_deposits")
      .eq("id", userId)
      .single()

    if (user) {
      await supabase
        .from("users")
        .update({
          balance: (user.balance || 0) + amount,
          total_deposits: (user.total_deposits || 0) + amount,
        })
        .eq("id", userId)
    }
  }

  return NextResponse.json({ received: true })
}
