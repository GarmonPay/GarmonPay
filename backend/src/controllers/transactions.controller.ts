import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../lib/http-error";
import { parseQuery } from "../lib/validate";
import { listTransactionsByUser } from "../services/wallet.service";

const transactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export async function getTransactionsHandler(request: Request, response: Response) {
  const userId = request.auth?.user.id;
  if (!userId) {
    throw new HttpError(401, "Unauthorized");
  }

  const query = parseQuery(transactionsQuerySchema, request);
  const transactions = await listTransactionsByUser(userId, query.limit, query.offset);
  response.status(200).json({ transactions });
}
