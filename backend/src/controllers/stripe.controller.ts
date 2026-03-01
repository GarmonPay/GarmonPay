import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../lib/http-error";
import { parseBody } from "../lib/validate";
import { getServiceClient } from "../services/supabase.service";
import { createCheckoutSession, processStripeWebhook } from "../services/stripe.service";

const createCheckoutSchema = z.object({
  amount: z.coerce.number().int().min(50).max(10000000),
  successUrl: z.string().url(),
  cancelUrl: z.string().url()
});

export async function createCheckoutSessionHandler(request: Request, response: Response) {
  const userId = request.auth?.user.id;
  if (!userId) {
    throw new HttpError(401, "Unauthorized");
  }

  const body = parseBody(createCheckoutSchema, request);
  const service = getServiceClient();
  const { data, error } = await service
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data || !(data as { email?: string | null }).email) {
    throw new HttpError(400, "User email is not available");
  }

  const result = await createCheckoutSession({
    userId,
    email: String((data as { email?: string }).email),
    amount: body.amount,
    successUrl: body.successUrl,
    cancelUrl: body.cancelUrl
  });

  response.status(200).json(result);
}

export async function stripeWebhookHandler(request: Request, response: Response) {
  const signature = request.headers["stripe-signature"];
  const headerValue = Array.isArray(signature) ? signature[0] : signature ?? null;
  const rawBody =
    typeof request.body === "string"
      ? request.body
      : Buffer.isBuffer(request.body)
        ? request.body.toString("utf8")
        : "";

  await processStripeWebhook(rawBody, headerValue);
  response.status(200).json({ received: true });
}
