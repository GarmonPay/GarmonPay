import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error";

export function requireAdmin(request: Request, _response: Response, next: NextFunction) {
  if (!request.auth) {
    next(new HttpError(401, "Unauthorized"));
    return;
  }

  const isAdmin = request.auth.role === "admin" || request.auth.isSuperAdmin;
  if (!isAdmin) {
    next(new HttpError(403, "Admin access required"));
    return;
  }

  next();
}
