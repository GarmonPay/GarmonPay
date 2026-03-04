const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const REQUIRED_ENV = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const STRIPE_API_VERSION = "2026-01-28.clover";
const MISSING_COLUMN_CODE = "42703";
const DUPLICATE_CODE = "23505";
const INVALID_UUID_CODE = "22P02";

function cleanEnv(value) {
  return (value || "").trim().replace(/^["']|["']$/g, "");
}

function getCode(error) {
  if (!error || typeof error !== "object") return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function getMessage(error) {
  if (!error || typeof error !== "object") return "";
  return typeof error.message === "string" ? error.message : "";
}

function getMissingColumn(error) {
  const message = getMessage(error);
  const fromColumnRelation = message.match(/column ["']?([a-zA-Z0-9_]+)["']? of relation/i);
  if (fromColumnRelation && fromColumnRelation[1]) return fromColumnRelation[1];
  const fromGeneric = message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i);
  return (fromGeneric && fromGeneric[1]) || null;
}

function isMissingColumn(error, column) {
  if (getCode(error) !== MISSING_COLUMN_CODE) return false;
  const missingColumn = getMissingColumn(error);
  if (missingColumn === column) return true;
  return getMessage(error).toLowerCase().includes(column.toLowerCase());
}

function getCustomerEmail(session) {
  const fallbackEmail = session?.metadata?.email;
  if (typeof session?.customer_email === "string" && session.customer_email.trim()) {
    return session.customer_email.trim();
  }
  if (typeof fallbackEmail === "string" && fallbackEmail.trim()) {
    return fallbackEmail.trim();
  }
  return "";
}

function getPaymentIntentId(session) {
  if (typeof session?.payment_intent === "string" && session.payment_intent) {
    return session.payment_intent;
  }
  if (
    session?.payment_intent &&
    typeof session.payment_intent === "object" &&
    typeof session.payment_intent.id === "string"
  ) {
    return session.payment_intent.id;
  }
  return null;
}

async function sessionAlreadyRecovered(supabase, sessionId) {
  const [existingTxResult, existingStripePaymentResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("id")
      .eq("reference_id", sessionId)
      .eq("type", "deposit")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("stripe_payments")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (existingTxResult.error) throw existingTxResult.error;
  if (existingStripePaymentResult.error) throw existingStripePaymentResult.error;
  return Boolean(existingTxResult.data || existingStripePaymentResult.data);
}

async function resolveUserId(supabase, session) {
  const metadataUserId =
    typeof session?.metadata?.user_id === "string" && session.metadata.user_id.trim()
      ? session.metadata.user_id.trim()
      : null;
  const clientReferenceId =
    typeof session?.client_reference_id === "string" && session.client_reference_id.trim()
      ? session.client_reference_id.trim()
      : null;
  const legacyMetadataUserId =
    typeof session?.metadata?.userId === "string" && session.metadata.userId.trim()
      ? session.metadata.userId.trim()
      : null;

  for (const candidateUserId of [metadataUserId, clientReferenceId, legacyMetadataUserId]) {
    if (!candidateUserId) continue;
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("id", candidateUserId)
      .limit(1)
      .maybeSingle();
    if (error) {
      if (getCode(error) === INVALID_UUID_CODE) continue;
      throw error;
    }
    if (data && typeof data.id === "string") return data.id;
  }

  const email = getCustomerEmail(session);
  if (!email) return null;

  const profileResult = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;
  if (profileResult.data && typeof profileResult.data.id === "string") {
    return profileResult.data.id;
  }

  const userResult = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (userResult.error) throw userResult.error;
  if (userResult.data && typeof userResult.data.id === "string") {
    return userResult.data.id;
  }

  return null;
}

async function insertStripePayment(supabase, session, userId, amountCents) {
  const customerEmail = getCustomerEmail(session) || "unknown";
  const paymentIntentId = getPaymentIntentId(session);
  const metadata = { user_id: userId };
  if (customerEmail !== "unknown") metadata.email = customerEmail;

  const payload = {
    stripe_session_id: session.id,
    session_id: session.id,
    transaction_id: session.id,
    user_id: userId,
    email: customerEmail,
    amount: amountCents / 100,
    amount_cents: amountCents,
    currency: (session.currency || "usd").toLowerCase(),
    product_type: "payment",
    status: "completed",
    metadata,
    created_at: new Date().toISOString(),
  };
  if (paymentIntentId) {
    payload.stripe_payment_intent = paymentIntentId;
    payload.stripe_payment_intent_id = paymentIntentId;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await supabase.from("stripe_payments").insert(payload);
    if (!error) return { status: "ok" };
    const code = getCode(error);
    if (code === DUPLICATE_CODE) return { status: "duplicate" };
    if (code === MISSING_COLUMN_CODE) {
      const missingColumn = getMissingColumn(error);
      if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
        delete payload[missingColumn];
        continue;
      }
    }
    return { status: "error", error };
  }

  return { status: "error", error: new Error("stripe_payments insert exhausted fallback attempts") };
}

async function insertTransactionWithSourceFallback(supabase, userId, sessionId, amountCents) {
  const basePayload = {
    user_id: userId,
    type: "deposit",
    amount: amountCents,
    status: "completed",
    description: `Stripe recovery ${sessionId}`,
    reference_id: sessionId,
  };

  const withSourceResult = await supabase.from("transactions").insert({
    ...basePayload,
    source: "stripe_recovery",
  });
  if (!withSourceResult.error) return { status: "ok" };
  if (getCode(withSourceResult.error) === DUPLICATE_CODE) return { status: "duplicate" };

  if (isMissingColumn(withSourceResult.error, "source")) {
    const fallbackResult = await supabase.from("transactions").insert(basePayload);
    if (!fallbackResult.error) return { status: "ok" };
    if (getCode(fallbackResult.error) === DUPLICATE_CODE) return { status: "duplicate" };
    return { status: "error", error: fallbackResult.error };
  }

  return { status: "error", error: withSourceResult.error };
}

async function ensureDeposit(supabase, userId, sessionId, amountCents) {
  const existingDepositResult = await supabase
    .from("deposits")
    .select("id")
    .or(`stripe_session.eq.${sessionId},stripe_session_id.eq.${sessionId}`)
    .limit(1)
    .maybeSingle();

  let hasDeposit = false;
  if (existingDepositResult.error) {
    if (isMissingColumn(existingDepositResult.error, "stripe_session_id")) {
      const fallbackLookup = await supabase
        .from("deposits")
        .select("id")
        .eq("stripe_session", sessionId)
        .limit(1)
        .maybeSingle();
      if (fallbackLookup.error) return { status: "error", error: fallbackLookup.error };
      hasDeposit = Boolean(fallbackLookup.data);
    } else {
      return { status: "error", error: existingDepositResult.error };
    }
  } else {
    hasDeposit = Boolean(existingDepositResult.data);
  }

  if (hasDeposit) return { status: "ok" };

  const depositPayload = {
    user_id: userId,
    amount: amountCents / 100,
    stripe_session: sessionId,
    stripe_session_id: sessionId,
    status: "completed",
    created_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase.from("deposits").insert(depositPayload);
    if (!error) return { status: "ok" };
    if (getCode(error) === DUPLICATE_CODE) return { status: "ok" };
    if (getCode(error) === MISSING_COLUMN_CODE) {
      const missingColumn = getMissingColumn(error);
      if (missingColumn && Object.prototype.hasOwnProperty.call(depositPayload, missingColumn)) {
        delete depositPayload[missingColumn];
        continue;
      }
    }
    return { status: "error", error };
  }

  return { status: "error", error: new Error("deposits insert exhausted fallback attempts") };
}

async function creditUser(supabase, userId, amountCents) {
  const userResult = await supabase
    .from("users")
    .select("balance, total_deposits")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();
  if (userResult.error || !userResult.data) {
    return { status: "error", error: userResult.error || new Error(`User not found: ${userId}`) };
  }

  const balance = Number(userResult.data.balance || 0);
  const totalDeposits = Number(userResult.data.total_deposits || 0);

  const updateResult = await supabase
    .from("users")
    .update({
      balance: balance + amountCents,
      total_deposits: totalDeposits + amountCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (updateResult.error) return { status: "error", error: updateResult.error };
  return { status: "ok" };
}

async function runRecovery() {
  const missingEnv = REQUIRED_ENV.filter((envName) => !cleanEnv(process.env[envName]));
  if (missingEnv.length > 0) {
    console.error(`[recover-payments] Missing required env vars: ${missingEnv.join(", ")}`);
    process.exit(1);
  }

  const stripeSecretKey = cleanEnv(process.env.STRIPE_SECRET_KEY);
  if (!stripeSecretKey.startsWith("sk_")) {
    console.error("[recover-payments] STRIPE_SECRET_KEY is invalid or missing");
    process.exit(1);
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: STRIPE_API_VERSION });
  const supabase = createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );

  let recovered = 0;
  let totalAmountCents = 0;
  let hasMore = true;
  let startingAfter;

  while (hasMore) {
    const listResult = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const session of listResult.data) {
      if (session.payment_status !== "paid") continue;

      const amountCents = session.amount_total || 0;
      if (amountCents <= 0) continue;

      try {
        const alreadyRecovered = await sessionAlreadyRecovered(supabase, session.id);
        if (alreadyRecovered) continue;

        const userId = await resolveUserId(supabase, session);
        if (!userId) continue;

        const stripePaymentInsert = await insertStripePayment(supabase, session, userId, amountCents);
        if (stripePaymentInsert.status === "duplicate") continue;
        if (stripePaymentInsert.status === "error") {
          console.error(`[recover-payments] stripe_payments insert failed for ${session.id}:`, stripePaymentInsert.error);
          continue;
        }

        const transactionInsert = await insertTransactionWithSourceFallback(supabase, userId, session.id, amountCents);
        if (transactionInsert.status === "duplicate") continue;
        if (transactionInsert.status === "error") {
          console.error(`[recover-payments] transactions insert failed for ${session.id}:`, transactionInsert.error);
          continue;
        }

        const depositInsert = await ensureDeposit(supabase, userId, session.id, amountCents);
        if (depositInsert.status === "error") {
          console.error(`[recover-payments] deposits insert failed for ${session.id}:`, depositInsert.error);
          continue;
        }

        const credit = await creditUser(supabase, userId, amountCents);
        if (credit.status === "error") {
          console.error(`[recover-payments] users balance update failed for ${session.id}:`, credit.error);
          continue;
        }

        recovered += 1;
        totalAmountCents += amountCents;
        console.log(
          `[recover-payments] recovered session=${session.id} user=${userId} amount_cents=${amountCents} amount_usd=${(
            amountCents / 100
          ).toFixed(2)}`
        );
      } catch (error) {
        console.error(`[recover-payments] session ${session.id} failed:`, error);
      }
    }

    hasMore = listResult.has_more;
    if (listResult.data.length > 0) {
      startingAfter = listResult.data[listResult.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  const totalAmountDollars = Number((totalAmountCents / 100).toFixed(2));
  console.log("[recover-payments] Summary:");
  console.log(`  recovered: ${recovered}`);
  console.log(`  totalAmountCents: ${totalAmountCents}`);
  console.log(`  totalAmountDollars: ${totalAmountDollars}`);
}

runRecovery().catch((error) => {
  console.error("[recover-payments] Fatal error:", error);
  process.exit(1);
});