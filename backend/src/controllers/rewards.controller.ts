import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../lib/http-error";
import { parseBody } from "../lib/validate";
import { trackAnalyticsEvent } from "../services/analytics.service";
import { creditReward } from "../services/wallet.service";

const rewardCreditSchema = z.object({
  userId: z.string().uuid(),
  amount: z.coerce.number().int().positive().max(100000),
  eventType: z.string().min(2).max(64),
  idempotencyKey: z.string().min(8).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export async function creditRewardHandler(request: Request, response: Response) {
  const payload = parseBody(rewardCreditSchema, request);
  const auth = request.auth;
  if (!auth) {
    throw new HttpError(401, "Unauthorized");
  }

  const isAdmin = auth.role === "admin" || auth.isSuperAdmin;
  if (!isAdmin && payload.userId !== auth.user.id) {
    throw new HttpError(403, "Cannot credit rewards for another user");
  }

  const result = await creditReward({
    userId: payload.userId,
    amount: payload.amount,
    eventType: payload.eventType,
    idempotencyKey: payload.idempotencyKey,
    metadata: payload.metadata
  });

  await trackAnalyticsEvent({
    userId: payload.userId,
    eventType: "reward_earned",
    source: "rewards_credit_api",
    payload: {
      amount: payload.amount,
      eventType: payload.eventType,
      rewardEventId: result.rewardEventId
    }
  }).catch(() => undefined);

  response.status(200).json(result);
}
