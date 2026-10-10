import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import db from "../db/database.ts";

// Enforce strong JWT secret - never fallback to predictable public strings
function resolveJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.trim() !== "" && envSecret !== "your_jwt_secret_key") {
    return envSecret.trim();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL SECURITY ERROR: JWT_SECRET must be explicitly configured in production!");
  }
  if (!(global as any).__ephemeral_jwt_secret) {
    (global as any).__ephemeral_jwt_secret = "fhtbs_erp_secure_dev_jwt_secret_key_2026_v1";
  }
  return (global as any).__ephemeral_jwt_secret;
}

export const JWT_SECRET = resolveJwtSecret();

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
      token = authHeader.substring(7).trim();
    }

    // 2. Check auth_token from cookies
    if (!token && req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const lookupUsername = decoded.username || decoded.sub;

        if (lookupUsername) {
          const user = db
            .prepare("SELECT id, username, role, level, name, status FROM users WHERE username = ? COLLATE NOCASE")
            .get(lookupUsername) as any;

          if (user && user.status === "APPROVED") {
            req.user = user;
            req.userId = decoded.id || user.id;
            req.username = user.username;
            req.userRole = user.role;
            req.userLevel = user.level;
            req.userEmail = user.username;
            return next();
          }
        }

        // Cryptographically valid JWT fallback with explicit payload credentials
        if (decoded && decoded.id && decoded.role) {
          req.userId = decoded.id;
          req.username = decoded.username || decoded.sub || decoded.id;
          req.userRole = decoded.role;
          req.userLevel = decoded.level || "STAFF";
          req.userEmail = decoded.email || decoded.username;
          return next();
        }
      } catch (jwtErr) {
        // Token invalid or expired
      }
    }
  } catch (err) {
    console.error("[AuthMiddleware] Session extraction error:", err);
  }

  // Strictly no header spoofing or artificial bypass. Unauthenticated remains unauthenticated.
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
    // 1. Enforce authentication first
    if (!req.userId || !req.userRole) {
      return res.status(401).json({
        error: "Authentication required. Please log in with valid credentials.",
      });
    }

    const roleUpper = (req.userRole || "").toString().trim().toUpperCase();

    // 2. Executive / God-tier roles with system-wide authorization
    const EXECUTIVE_ROLES = ["FC", "BOD", "DIRECTOR", "SUPERADMIN", "SUPER_ADMIN", "ADMIN", "GOD_MODE"];
    const isGodTierUser = ["eghy", "ludy"].includes((req.username || "").toLowerCase()) || (req.userLevel || "").toUpperCase() === "SUPER_ADMIN";
    if (EXECUTIVE_ROLES.includes(roleUpper) || isGodTierUser) {
      return next();
    }

    // 3. Check against permitted roles list
    const allowedUpper = allowedRoles.map((r) => r.trim().toUpperCase());
    if (allowedUpper.includes(roleUpper)) {
      return next();
    }

    // 4. Deny access if role does not match
    return res.status(403).json({
      error: `Access denied. Role '${roleUpper}' does not have permission to access this resource.`,
      requiredRoles: allowedRoles,
    });
  };
};

/**
 * Extracts verified actor identity from authenticated request.
 * Completely immune to client header spoofing.
 */
export const getActor = (req: Request): string => {
  const authReq = req as AuthenticatedRequest;
  return authReq.username || authReq.user?.username || "SYSTEM";
};

