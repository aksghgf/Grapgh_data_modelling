import type { NextFunction, Request, Response } from "express";
import { LlmRateLimitError } from "../providers/groq.provider.js";

/**
 * Express global error handler: maps known LLM errors to HTTP status codes.
 */
export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof LlmRateLimitError) {
    res.status(503).json({ error: err.message, code: err.code });
    return;
  }
  const msg = err instanceof Error ? err.message : "Query failed.";
  res.status(500).json({ error: msg });
}
