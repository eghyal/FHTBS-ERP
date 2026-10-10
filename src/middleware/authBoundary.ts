import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import db from "../db/database.ts";
import { JWT_SECRET } from "./auth.ts";

export interface UserSessionPayload {
  userId: string;
  username: string;
  role: string;
  level?: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: any;
      userSession?: UserSessionPayload;
    }
  }
}

/**
 * Strict authentication guard for API endpoints.
 * Extracts session from Bearer token, Cookie (auth_token/access_token), and verifies against database.
 */
export function authenticateSession(req: Request, res: Response, next: NextFunction) {
  const token =
    req.cookies?.access_token ||
    req.cookies?.auth_token ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Akses ditolak: Sesi tidak ditemukan. Silakan login kembali.",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const lookupUsername = decoded.username || decoded.sub;

    if (!lookupUsername) {
      return res.status(401).json({
        success: false,
        error: "INVALID_SESSION",
        message: "Payload token tidak valid.",
      });
    }

    // Verify user exists and is active in database
    const user = db
      .prepare(
        "SELECT id, username, role, level, name, status, permissions FROM users WHERE username = ? COLLATE NOCASE",
      )
      .get(lookupUsername) as any;

    if (!user || user.status !== "APPROVED") {
      return res.status(403).json({
        success: false,
        error: "ACCOUNT_INACTIVE",
        message: "Akun pengguna tidak aktif atau belum disetujui.",
      });
    }

    let parsedPermissions: string[] = [];
    try {
      if (user.permissions) {
        parsedPermissions = JSON.parse(user.permissions);
      }
    } catch {
      parsedPermissions = [];
    }

    const sessionPayload: UserSessionPayload = {
      userId: user.id,
      username: user.username,
      role: (user.role || "").toUpperCase(),
      level: user.level,
      permissions: parsedPermissions,
    };

    req.user = user;
    req.userSession = sessionPayload;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: "INVALID_TOKEN",
      message: "Sesi Anda telah kedaluwarsa atau tidak valid.",
    });
  }
}

/**
 * Strict Role / Granular Permission boundary enforcement.
 * Checks against role list or granular permission keys.
 */
export function authorizePermission(requiredRoleOrPermission: string | string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = req.userSession || (req.user ? {
      role: req.user.role,
      permissions: []
    } : null);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHENTICATED",
        message: "Identitas pengguna belum terverifikasi.",
      });
    }

    const roleUpper = (session.role || "").toString().trim().toUpperCase();

    // Executive / God-tier roles with system-wide bypass
    const EXECUTIVE_ROLES = ["FC", "BOD", "DIRECTOR", "SUPERADMIN", "ADMIN"];
    if (EXECUTIVE_ROLES.includes(roleUpper)) {
      return next();
    }

    const requirements = Array.isArray(requiredRoleOrPermission)
      ? requiredRoleOrPermission.map((r) => r.toUpperCase())
      : [requiredRoleOrPermission.toUpperCase()];

    // Match either role or permission
    const hasRoleMatch = requirements.includes(roleUpper);
    const hasPermissionMatch = session.permissions && requirements.some((reqPerm) =>
      session.permissions.map((p: string) => p.toUpperCase()).includes(reqPerm),
    );

    if (hasRoleMatch || hasPermissionMatch) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: "FORBIDDEN",
      message: `Akses ditolak: Peran atau izin Anda tidak mencukupi untuk akses ini. Diperlukan: [${requirements.join(", ")}].`,
    });
  };
}
