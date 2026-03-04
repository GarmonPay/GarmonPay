import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";
import Stripe from "stripe";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type Outcome =
  | { status: "ok" }
  | { status: "duplicate" }
  | { status: "error"; error: unknown };

const STRIPE_API_VERSION = "2026-01-28.clover";
const MISSING_COLUMN_CODE = "42703";
const DUPLICATE_CODE = "23505";
const INVALID_UUID_CODE = "22P02";

function getCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function getMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

function getMissingColumn(error: unknown): string | null {
  const message = getMessage(error);
  const fromColumnRelation = message.match(/column ["']?([a-zA-Z0-9_]+)["']? of relation/i);
  if (fromColumnRelation?.[1]) return fromColumnRelation[1];
  const fromGeneric = message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i);
  return fromGeneric?.[1] ?? null;
}

function isMissingColumn(error: unknown, column: string): boolean {
  const code = getCode(error);
  if (code !== MISSING_COLUMN_CODE) return false;
  const missingColumn = getMissingColumn(error);
  if (missingColumn === column) return true;
  return getMessage(error).toLowerCase().includes(column.toLowerCase());
}

function cleanEnv(value: string | undefined): string {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function getCustomerEmail(session: Stripe.Checkout.Session): string {
  const fallbackEmail = session.metadata?.email;
  if (typeof session.customer_email === "string" && session.customer_email.trim()) {
    return session.customer_email.trim();
  }
  if (typeof fallbackEmail === "string" && fallbackEmail.trim()) {
    return fallbackEmail.trim();
  }
  return "";
}

function getPaymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === "string" && session.payment_intent) {
    return session.payment_intent;
  }
  if (
    session.payment_intent &&
    typeof session.payment_intent === "object" &&
    "id" in session.payment_intent &&
    typeof session.payment_intent.id === "string"
  ) {
    return session.payment_intent.id;
  }
  return null;
}

async function sessionAlreadyRecovered(supabase: AdminClient, sessionId: string): Promise<boolean> {
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

async function resolveUserId(supabase: AdminClient, session: Stripe.Checkout.Session): Promise<string | null> {
  const metadataUserId =
    typeof session.metadata?.user_id === "string" && session.metadata.user_id.trim()
      ? session.metadata.user_id.trim()
      : null;
  const clientReferenceId =
    typeof session.client_reference_id === "string" && session.client_reference_id.trim()
      ? session.client_reference_id.trim()
      : null;
  const legacyMetadataUserId =
    typeof session.metadata?.userId === "string" && session.metadata.userId.trim()
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
    if (data && typeof (data as { id?: unknown }).id === "string") {
      return (data as { id: string }).id;
    }
  }

  const email = getCustomerEmail(session);
  if (!email) return null;

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profileRow && typeof (profileRow as { id?: unknown }).id === "string") {
    return (profileRow as { id: string }).id;
  }

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (userError) throw userError;
  if (userRow && typeof (userRow as { id?: unknown }).id === "string") {
    return (userRow as { id: string }).id;
  }

  return null;
}

async function insertStripePayment(
  supabase: AdminClient,
  session: Stripe.Checkout.Session,
  userId: string,
  amountCents: number
): Promise<Outcome> {
  const customerEmail = getCustomerEmail(session) || "unknown";
  const paymentIntentId = getPaymentIntentId(session);
  const metadata: Record<string, string> = { user_id: userId };
  if (customerEmail !== "unknown") metadata.email = customerEmail;

  const payload: Record<string, unknown> = {
    stripe_session_id: session.id,
    session_id: session.id,
    transaction_id: session.id,
    user_id: userId,
    email: customerEmail,
    amount: amountCents / 100,
    amount_cents: amountCents,
    currency: (session.currency ?? "usd").toLowerCase(),
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

async function insertTransactionWithSourceFallback(
  supabase: AdminClient,
  userId: string,
  sessionId: string,
  amountCents: number
): Promise<Outcome> {
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

async function ensureDeposit(
  supabase: AdminClient,
  userId: string,
  sessionId: string,
  amountCents: number
): Promise<Outcome> {
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
      if (fallbackLookup.error) {
        return { status: "error", error: fallbackLookup.error };
      }
      hasDeposit = Boolean(fallbackLookup.data);
    } else {
      return { status: "error", error: existingDepositResult.error };
    }
  } else {
    hasDeposit = Boolean(existingDepositResult.data);
  }

  if (hasDeposit) return { status: "ok" };

  const depositPayload: Record<string, unknown> = {
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

async function creditUser(supabase: AdminClient, userId: string, amountCents: number): Promise<Outcome> {
  const userResult = await supabase
    .from("users")
    .select("balance, total_deposits")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();

  if (userResult.error || !userResult.data) {
    return { status: "error", error: userResult.error ?? new Error(`User not found: ${userId}`) };
  }

  const row = userResult.data as { balance?: number | string | null; total_deposits?: number | string | null };
  const balance = Number(row.balance ?? 0);
  const totalDeposits = Number(row.total_deposits ?? 0);

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

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const stripeSecretKey = cleanEnv(process.env.STRIPE_SECRET_KEY);
  if (!stripeSecretKey.startsWith("sk_")) {
    return NextResponse.json({ success: false, message: "Stripe not configured" }, { status: 503 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Supabase not configured" }, { status: 503 });
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: STRIPE_API_VERSION });

  let recovered = 0;
  let totalAmountCents = 0;
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    let listResult: Stripe.ApiList<Stripe.Checkout.Session>;
    try {
      listResult = await stripe.checkout.sessions.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe list sessions failed";
      console.error("[recover-stripe-payments] Stripe list error:", message);
      return NextResponse.json({ success: false, message: "Stripe error", error: message }, { status: 502 });
    }

    for (const session of listResult.data) {
      if (session.payment_status !== "paid") continue;

      const amountCents = session.amount_total ?? 0;
      if (amountCents <= 0) continue;

      try {
        const alreadyRecovered = await sessionAlreadyRecovered(supabase, session.id);
        if (alreadyRecovered) continue;

        const userId = await resolveUserId(supabase, session);
        if (!userId) continue;

        const stripePaymentInsert = await insertStripePayment(supabase, session, userId, amountCents);
        if (stripePaymentInsert.status === "duplicate") continue;
        if (stripePaymentInsert.status === "error") {
          console.error("[recover-stripe-payments] stripe_payments insert failed:", stripePaymentInsert.error);
          continue;
        }

        const transactionInsert = await insertTransactionWithSourceFallback(supabase, userId, session.id, amountCents);
        if (transactionInsert.status === "duplicate") continue;
        if (transactionInsert.status === "error") {
          console.error("[recover-stripe-payments] transactions insert failed:", transactionInsert.error);
          continue;
        }

        const depositInsert = await ensureDeposit(supabase, userId, session.id, amountCents);
        if (depositInsert.status === "error") {
          console.error("[recover-stripe-payments] deposits insert failed:", depositInsert.error);
          continue;
        }

        const credit = await creditUser(supabase, userId, amountCents);
        if (credit.status === "error") {
          console.error("[recover-stripe-payments] users balance update failed:", credit.error);
          continue;
        }

        recovered += 1;
        totalAmountCents += amountCents;
      } catch (error) {
        console.error(`[recover-stripe-payments] Session ${session.id} failed:`, error);
      }
    }

    hasMore = listResult.has_more;
    if (listResult.data.length > 0) {
      startingAfter = listResult.data[listResult.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return NextResponse.json({
    success: true,
    recovered,
    totalAmountCents,
    totalAmountDollars: Number((totalAmountCents / 100).toFixed(2)),
  });
}
