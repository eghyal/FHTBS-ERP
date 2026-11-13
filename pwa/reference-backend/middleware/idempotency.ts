import { type Request, type Response, type NextFunction } from "express";
import { IdempotencyGuard } from "../lib/idempotency.ts";

const idempotencyResponseCache = new Map<
  string,
  { status: number; body: any; timestamp: number; ttlMs: number }
>();
const EXPLICIT_CACHE_TTL_MS = 60_000; // 60s for explicit offline-sync / outbox keys
const AUTO_DEBOUNCE_TTL_MS = 2_500; // 2.5s anti-double-click window for auto-hashed payload keys

// Periodic cache sweeper to prevent memory leaks (T2)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of idempotencyResponseCache.entries()) {
    if (now - v.timestamp > v.ttlMs) {
      idempotencyResponseCache.delete(k);
    }
  }
}, 30_000).unref?.();

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

  const trimmed = rawKey.trim();
  if (!trimmed) return next();

  const userScope = String((req as any).userId || req.headers["x-user-email"] || req.ip || "anon");
  const isAutoKey = trimmed.startsWith("auto:");
  const ttlMs = isAutoKey ? AUTO_DEBOUNCE_TTL_MS : EXPLICIT_CACHE_TTL_MS;
  const scopedKey = `${userScope}:${req.method}:${req.path}:${trimmed}`;

  // 1. Check if identical request recently completed within its TTL window
  const cached = idempotencyResponseCache.get(scopedKey);
  if (cached && Date.now() - cached.timestamp < cached.ttlMs) {
    return res.status(cached.status).json(cached.body);
  }

  // 2. Safely acquire in-flight lock (T1)
  if (!IdempotencyGuard.acquire(scopedKey)) {
    return res.status(409).json({
      error: "Request is currently being processed. Please wait.",
      retryAfterSeconds: 2,
    });
  }

  // Intercept res.json to cache 2xx responses and release lock
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    IdempotencyGuard.release(scopedKey);
    const status = res.statusCode || 200;
    if (status >= 200 && status < 300) {
      idempotencyResponseCache.set(scopedKey, {
        status,
        body,
        timestamp: Date.now(),
        ttlMs,
      });
    }
    return originalJson(body);
  };

  // Ensure lock release on stream finish or premature abort
  res.on("finish", () => {
    IdempotencyGuard.release(scopedKey);
  });
  res.on("close", () => {
    IdempotencyGuard.release(scopedKey);
  });

  next();
};

