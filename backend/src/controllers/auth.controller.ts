import type { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../lib/validate";
import { loginWithEmailPassword, registerWithEmailPassword } from "../services/auth.service";
import { trackAnalyticsEvent } from "../services/analytics.service";

const authSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128)
});

export async function registerHandler(request: Request, response: Response) {
  const payload = parseBody(authSchema, request);
  const result = await registerWithEmailPassword(payload.email, payload.password);

  await trackAnalyticsEvent({
    userId: result.user.id,
    eventType: "login",
    source: "mobile_register",
    payload: { method: "email_password" }
  }).catch(() => undefined);

  response.status(201).json(result);
}

export async function loginHandler(request: Request, response: Response) {
  const payload = parseBody(authSchema, request);
  const result = await loginWithEmailPassword(payload.email, payload.password);

  await trackAnalyticsEvent({
    userId: result.user.id,
    eventType: "login",
    source: "mobile_login",
    payload: { method: "email_password" }
  }).catch(() => undefined);

  response.status(200).json(result);
}
