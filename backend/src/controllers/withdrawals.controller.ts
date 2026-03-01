import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../lib/http-error";
import { parseBody } from "../lib/validate";
import { trackAnalyticsEvent } from "../services/analytics.service";
import { listWithdrawalsByUser, requestWithdrawal } from "../services/wallet.service";

const withdrawalRequestSchema = z.object({
  amount: z.coerce.number().int().positive().max(10000000),
  paymentMethod: z.string().min(2).max(50),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export async function requestWithdrawalHandler(request: Request, response: Response) {
  const userId = request.auth?.user.id;
  if (!userId) {
    throw new HttpError(401, "Unauthorized");
  }

  const payload = parseBody(withdrawalRequestSchema, request);
  const withdrawal = await requestWithdrawal({
    userId,
    amount: payload.amount,
    paymentMethod: payload.paymentMethod,
    metadata: payload.metadata
  });

  await trackAnalyticsEvent({
    userId,
    eventType: "withdrawal_requested",
    source: "withdrawal_api",
    payload: {
      amount: payload.amount,
      paymentMethod: payload.paymentMethod,
      withdrawalId: withdrawal.id
    }
  }).catch(() => undefined);

  response.status(201).json({
    withdrawal
  });
}

export async function listUserWithdrawalsHandler(request: Request, response: Response) {
  const userId = request.auth?.user.id;
  if (!userId) {
    throw new HttpError(401, "Unauthorized");
  }

  const withdrawals = await listWithdrawalsByUser(userId);
  response.status(200).json({ withdrawals });
}
