import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../lib/http-error";
import { parseBody, parseQuery } from "../lib/validate";
import { listAnalyticsEvents, trackAnalyticsEvent } from "../services/analytics.service";

const analyticsBodySchema = z.object({
  userId: z.string().uuid().optional(),
  eventType: z.string().min(2).max(64),
  source: z.string().min(2).max(64),
  payload: z.record(z.string(), z.unknown()).optional()
});

const analyticsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  eventType: z.string().min(2).max(64).optional()
});

export async function trackAnalyticsEventHandler(request: Request, response: Response) {
  const payload = parseBody(analyticsBodySchema, request);
  const auth = request.auth;
  const requesterIsAdmin = auth?.role === "admin" || auth?.isSuperAdmin;
  const requesterUserId = auth?.user.id;
  const targetUserId = payload.userId ?? requesterUserId;

  if (payload.userId && payload.userId !== requesterUserId && !requesterIsAdmin) {
    throw new HttpError(403, "Cannot submit analytics for another user");
  }

  await trackAnalyticsEvent({
    userId: targetUserId,
    eventType: payload.eventType,
    source: payload.source,
    payload: payload.payload
  });

  response.status(201).json({ ok: true });
}

export async function listAnalyticsEventsHandler(request: Request, response: Response) {
  const query = parseQuery(analyticsQuerySchema, request);
  const events = await listAnalyticsEvents({
    limit: query.limit,
    offset: query.offset,
    eventType: query.eventType
  });
  response.status(200).json({ events });
}
