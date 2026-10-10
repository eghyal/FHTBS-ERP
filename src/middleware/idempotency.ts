import { type Request, type Response, type NextFunction } from "express";
import { IdempotencyGuard } from "../lib/idempotency.ts";

const idempotencyResponseCache = new Map<string, { status: number; body: any; timestamp: number }>();
const CACHE_TTL_MS = 60000; // 1 minute response cache

/**
 * Idempotency Middleware for Express
 * Prevents duplicated state mutations (e.g. from offline retries or accidental double-clicks)
 */
export const idempotencyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }

  const rawKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"];
  if (!rawKey || typeof rawKey !== "string") {
    return next();
  }

  const key = rawKey.trim();
  if (!key) return next();

  // 1. Check if identical request recently completed
  const cached = idempotencyResponseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.status(cached.status).json(cached.body);
  }

  // 2. Check if identical request is currently in-flight
  if (IdempotencyGuard.isInFlight(key)) {
    return res.status(409).json({
      error: "Request is currently being processed. Please wait.",
      retryAfterSeconds: 2,
    });
  }

  // Mark in flight
  (IdempotencyGuard as any).inFlightTokens?.add?.(key);

  // Intercept res.json to cache response
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    idempotencyResponseCache.set(key, {
      status: res.statusCode || 200,
      body,
      timestamp: Date.now(),
    });
    return originalJson(body);
  };

  next();
};
