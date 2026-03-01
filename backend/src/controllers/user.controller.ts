import type { Request, Response } from "express";
import { HttpError } from "../lib/http-error";
import { getUserProfile } from "../services/user.service";

export async function getProfileHandler(request: Request, response: Response) {
  const userId = request.auth?.user.id;
  if (!userId) {
    throw new HttpError(401, "Unauthorized");
  }

  const profile = await getUserProfile(userId);
  response.status(200).json(profile);
}
