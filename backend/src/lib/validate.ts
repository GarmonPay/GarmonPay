import type { Request } from "express";
import type { z, ZodTypeAny } from "zod";
import { HttpError } from "./http-error";

export function parseBody<TSchema extends ZodTypeAny>(schema: TSchema, req: Request): z.infer<TSchema> {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new HttpError(400, "Invalid request body", result.error.flatten());
  }
  return result.data;
}

export function parseQuery<TSchema extends ZodTypeAny>(schema: TSchema, req: Request): z.infer<TSchema> {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw new HttpError(400, "Invalid query parameters", result.error.flatten());
  }
  return result.data;
}

export function parseParams<TSchema extends ZodTypeAny>(schema: TSchema, req: Request): z.infer<TSchema> {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    throw new HttpError(400, "Invalid path parameters", result.error.flatten());
  }
  return result.data;
}
