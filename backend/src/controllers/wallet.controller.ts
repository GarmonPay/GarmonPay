import type { Request, Response } from "express";
import { HttpError } from "../lib/http-error";
import { getWalletSummary } from "../services/wallet.service";

export async function getWalletHandler(request: Request, response: Response) {
  const userId = request.auth?.user.id;
  if (!userId) {
    throw new HttpError(401, "Unauthorized");
  }

  const wallet = await getWalletSummary(userId);
  response.status(200).json(wallet);
}
