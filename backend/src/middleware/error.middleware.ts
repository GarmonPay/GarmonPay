import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error";
import { logger } from "../config/logger";

export function notFoundHandler(_request: Request, response: Response) {
  response.status(404).json({
    message: "Endpoint not found"
  });
}

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction
) {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    });
    return;
  }

  logger.error("Unhandled API error", {
    path: request.path,
    method: request.method,
    error: error instanceof Error ? error.message : String(error)
  });

  response.status(500).json({
    message: "Internal server error"
  });
}
