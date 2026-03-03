require("dotenv").config({ path: ".env.local" })

const Stripe = require("stripe")

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

async function inspectPayments() {
  const payments = await stripe.paymentIntents.list({
    limit: 5,
  })

  for (const payment of payments.data) {
    console.log("---------------")
    console.log("ID:", payment.id)
    console.log("Amount:", payment.amount_received)
    console.log("Customer:", payment.customer)
    console.log("Receipt Email:", payment.receipt_email)
    console.log("Charges:", payment.charges?.data[0]?.billing_details)
    console.log("Metadata:", payment.metadata)
  }
}

inspectPayments()