import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../lib/http-error";
import { parseBody, parseParams, parseQuery } from "../lib/validate";
import {
  adminListRewardEvents,
  adminListUsers,
  adminListWithdrawals,
  adminManualCredit,
  adminProcessWithdrawal
} from "../services/wallet.service";

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

const withdrawalsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["pending", "approved", "rejected", "paid"]).optional()
});

const rewardsQuerySchema = paginationQuerySchema.extend({
  userId: z.string().uuid().optional()
});

const processWithdrawalParamsSchema = z.object({
  id: z.string().uuid()
});

const processWithdrawalBodySchema = z.object({
  status: z.enum(["approved", "rejected", "paid"]),
  adminNote: z.string().max(500).optional()
});

const manualCreditBodySchema = z.object({
  userId: z.string().uuid(),
  amount: z.coerce.number().int().positive().max(10000000),
  reason: z.string().min(3).max(300)
});

function getAdminId(request: Request): string {
  const adminId = request.auth?.user.id;
  if (!adminId) {
    throw new HttpError(401, "Unauthorized");
  }
  return adminId;
}

export async function adminListUsersHandler(request: Request, response: Response) {
  const query = parseQuery(paginationQuerySchema, request);
  const users = await adminListUsers(query.limit, query.offset);
  response.status(200).json({ users });
}

export async function adminListWithdrawalsHandler(request: Request, response: Response) {
  const query = parseQuery(withdrawalsQuerySchema, request);
  const withdrawals = await adminListWithdrawals(query.status, query.limit, query.offset);
  response.status(200).json({ withdrawals });
}

export async function adminProcessWithdrawalHandler(request: Request, response: Response) {
  const adminUserId = getAdminId(request);
  const params = parseParams(processWithdrawalParamsSchema, request);
  const body = parseBody(processWithdrawalBodySchema, request);

  await adminProcessWithdrawal({
    adminUserId,
    withdrawalId: params.id,
    status: body.status,
    adminNote: body.adminNote
  });

  response.status(200).json({ ok: true });
}

export async function adminManualCreditHandler(request: Request, response: Response) {
  const adminUserId = getAdminId(request);
  const body = parseBody(manualCreditBodySchema, request);

  await adminManualCredit({
    adminUserId,
    userId: body.userId,
    amount: body.amount,
    reason: body.reason
  });

  response.status(200).json({ ok: true });
}

export async function adminListRewardsHandler(request: Request, response: Response) {
  const query = parseQuery(rewardsQuerySchema, request);
  const rewards = await adminListRewardEvents(query.limit, query.offset, query.userId);
  response.status(200).json({ rewards });
}
