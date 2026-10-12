import { type Request, type Response, type NextFunction } from "express";
import { IdempotencyGuard } from "../lib/idempotency.ts";

const idempotencyResponseCache = new Map<string, { status: number; body: any; timestamp: number }>();
const CACHE_TTL_MS = 60000; // 1 minute response cache

// Periodic cache sweeper to prevent memory leaks (T2)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of idempotencyResponseCache.entries()) {
    if (now - v.timestamp > CACHE_TTL_MS) {
      idempotencyResponseCache.delete(k);
    }
  }
}, CACHE_TTL_MS).unref?.();

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

  // 2. Safely acquire in-flight lock (T1)
  if (!IdempotencyGuard.acquire(key)) {
    return res.status(409).json({
      error: "Request is currently being processed. Please wait.",
      retryAfterSeconds: 2,
    });
  }

  // Intercept res.json to cache response and release lock
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    IdempotencyGuard.release(key);
    idempotencyResponseCache.set(key, {
      status: res.statusCode || 200,
      body,
      timestamp: Date.now(),
    });
    return originalJson(body);
  };

  // Ensure lock release on stream finish or premature abort
  res.on("finish", () => {
    IdempotencyGuard.release(key);
  });
  res.on("close", () => {
    IdempotencyGuard.release(key);
  });

  next();
};
