import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error";
import { getAuthenticatedUser, getUserRole } from "../services/supabase.service";

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.authorization ?? request.headers.Authorization;
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice("Bearer ".length).trim();
}

export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const token = extractBearerToken(request);
  if (!token) {
    next(new HttpError(401, "Missing bearer token"));
    return;
  }

  const user = await getAuthenticatedUser(token);
  const roleInfo = await getUserRole(user.id);
  request.auth = {
    token,
    user,
    role: roleInfo.role,
    isSuperAdmin: roleInfo.isSuperAdmin
  };
  next();
}

export async function optionalAuth(request: Request, _response: Response, next: NextFunction) {
  const token = extractBearerToken(request);
  if (!token) {
    next();
    return;
  }

  try {
    const user = await getAuthenticatedUser(token);
    const roleInfo = await getUserRole(user.id);
    request.auth = {
      token,
      user,
      role: roleInfo.role,
      isSuperAdmin: roleInfo.isSuperAdmin
    };
  } catch {
    // Anonymous event tracking still works without auth context.
  }

  next();
}
