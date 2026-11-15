import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import db from "../db/database.ts";

let jwtSecretSource: "ENV_PRODUCTION" | "CRYPTO_GENERATED_64B" = "CRYPTO_GENERATED_64B";

// Resolve a persistent >=32-char cryptographic JWT secret across Dev and Production environments
function resolveJwtSecret(): string {
  const envSecret = (process.env.JWT_SECRET || "").trim();
  if (
    envSecret.length >= 32 &&
    envSecret !== "your_jwt_secret_key" &&
    envSecret !== "changeme"
  ) {
    jwtSecretSource = "ENV_PRODUCTION";
    return envSecret;
  }

  if ((global as any).__ephemeral_jwt_secret) {
    return (global as any).__ephemeral_jwt_secret;
  }

  const generated64ByteHex = crypto.randomBytes(64).toString("hex"); // 128 hex chars (512-bit entropy)
  try {
    const row = db
      .prepare("SELECT value FROM system_settings WHERE key = 'jwt_signing_secret'")
      .get() as { value?: string } | undefined;
    const stored = (row?.value || "").trim();
    // Ensure stored secret is at least 64 chars and not the legacy static dev string
    if (
      stored.length >= 64 &&
      stored !== "fhtbs_erp_secure_dev_jwt_secret_key_2026_v1"
    ) {
      jwtSecretSource = "CRYPTO_GENERATED_64B";
      (global as any).__ephemeral_jwt_secret = stored;
      return stored;
    }
    db.prepare(
      "INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('jwt_signing_secret', ?, CURRENT_TIMESTAMP)"
    ).run(generated64ByteHex);
  } catch {
    // system_settings table might not be ready yet; keep generated64ByteHex in memory
  }
  jwtSecretSource = "CRYPTO_GENERATED_64B";
  (global as any).__ephemeral_jwt_secret = generated64ByteHex;
  return generated64ByteHex;
}

export const JWT_SECRET = resolveJwtSecret();

export function getJwtSecurityMetadata() {
  return {
    jwtSecretStrong: JWT_SECRET.length >= 32,
    jwtSecretLength: JWT_SECRET.length,
    jwtSecretSource,
    envJwtConfigured: Boolean(
      process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 32,
    ),
  };
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
  level: string;
  name: string;
  status: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  userId?: string;
  username?: string;
  userRole?: string;
  userLevel?: string;
  userEmail?: string;
}

export const EXECUTIVE_ROLES = [
  "FC",
  "BOD",
  "DIRECTOR",
  "SUPERADMIN",
  "SUPER_ADMIN",
  "ADMIN",
  "GOD_MODE",
];

/**
 * Middleware that extracts and securely verifies user identity from
 * Authorization Header (Bearer JWT), Cookie (auth_token), or authenticated session headers.
 */
export const populateUserSession = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    let token: string | null = null;

    // 1. Check Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const extracted = authHeader.substring(7).trim();
      if (extracted && extracted !== "null" && extracted !== "undefined") {
        token = extracted;
      }
    }

    // 2. Check auth_token from cookies
    if (!token && req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const lookupUsername = (decoded.username || decoded.sub || "").toString().trim();

        if (lookupUsername || decoded.id) {
          const user = (
            decoded.id
              ? db
                  .prepare(
                    "SELECT id, username, role, level, name, status FROM users WHERE id = ? OR TRIM(username) = ? COLLATE NOCASE"
                  )
                  .get(decoded.id, lookupUsername)
              : db
                  .prepare(
                    "SELECT id, username, role, level, name, status FROM users WHERE TRIM(username) = ? COLLATE NOCASE"
                  )
                  .get(lookupUsername)
          ) as any;

          if (user && (user.status === "APPROVED" || !user.status || user.status === "ACTIVE")) {
            req.user = user;
            req.userId = user.id;
            req.username = user.username;
            req.userRole = user.role;
            req.userLevel = user.level || "STAFF";
            req.userEmail = user.username;
            return next();
          } else if (user && user.status !== "APPROVED") {
            return next();
          }
        }
      } catch (jwtErr) {
        // Token invalid or expired
      }
    }
  } catch (err) {
    console.error("[AuthMiddleware] Session extraction error:", err);
  }

  next();
};

/**
 * Strict authentication guard. Blocks unauthenticated access.
 */
export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.userId || !req.userRole) {
    return res.status(401).json({
      error: "Authentication required. Please log in to access this resource.",
    });
  }
  next();
};

/**
 * Strict Role-Based Access Control (RBAC) middleware.
 * Verifies that the authenticated user possesses one of the required roles or executive privileges.
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userId || !req.userRole) {
      return res.status(401).json({
        error: "Authentication required. Please log in with valid credentials.",
      });
    }

    const roleUpper = (req.userRole || "").toString().trim().toUpperCase();
    const levelUpper = (req.userLevel || "").toString().trim().toUpperCase();

    const isGodTierUser = levelUpper === "SUPER_ADMIN" || roleUpper === "GOD_MODE";
    if (EXECUTIVE_ROLES.includes(roleUpper) || isGodTierUser) {
      return next();
    }

    const allowedUpper = allowedRoles.map((r) => r.trim().toUpperCase());
    // Also map PPIC and QA_QC seamlessly where MANUFACTURING/ENGINEERING/WAREHOUSE/PRODUCTION routes are shared
    if (allowedUpper.includes(roleUpper)) {
      return next();
    }
    const isReadOnlyMethod = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
    if (
      isReadOnlyMethod &&
      roleUpper === "PPIC" &&
      (allowedUpper.includes("PRODUCTION") || allowedUpper.includes("ENGINEERING") || allowedUpper.includes("WAREHOUSE"))
    ) {
      return next();
    }
    if (
      isReadOnlyMethod &&
      roleUpper === "QA_QC" &&
      (allowedUpper.includes("WAREHOUSE") || allowedUpper.includes("PRODUCTION") || allowedUpper.includes("ENGINEERING"))
    ) {
      return next();
    }

    return res.status(403).json({
      error: `Access denied. Role '${roleUpper}' does not have permission to access this resource.`,
      requiredRoles: allowedRoles,
    });
  };
};

/**
 * 3-Tier Level Guard (STAFF, SUPERVISOR, MANAGER).
 */
export const requireMinimumLevel = (minLevel: "STAFF" | "SUPERVISOR" | "MANAGER") => {
  const rank: Record<string, number> = {
    STAFF: 1,
    SUPERVISOR: 2,
    MANAGER: 3,
    SUPER_ADMIN: 4,
  };
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userId || !req.userRole) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const roleUpper = (req.userRole || "").toString().trim().toUpperCase();
    const levelUpper = (req.userLevel || "STAFF").toString().trim().toUpperCase();
    if (EXECUTIVE_ROLES.includes(roleUpper)) {
      return next();
    }
    const userRank = rank[levelUpper] || 1;
    const requiredRank = rank[minLevel] || 1;
    if (userRank >= requiredRank) {
      return next();
    }
    return res.status(403).json({
      error: `Access denied. Minimum level '${minLevel}' is required (your level: '${levelUpper}').`,
    });
  };
};

/**
 * Extracts verified actor identity from authenticated request.
 */
export const getActor = (req: Request): string => {
  const authReq = req as AuthenticatedRequest;
  return authReq.username || authReq.user?.username || "SYSTEM";
};
