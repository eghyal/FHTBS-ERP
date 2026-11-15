import jwt from "jsonwebtoken";
import { Router } from "express";
import db from "../db/database.ts";
import {
  requireRole,
  JWT_SECRET,
  getActor,
  type AuthenticatedRequest,
} from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { getDailyAuthKey } from "../utils/auth.ts";
import bcrypt from "bcrypt";

export const router = Router();

router.get(["/api/auth/daily-key", "/daily-key"], (req, res) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const key = getDailyAuthKey(actor);
    res.json({ success: true, key, username: actor });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(["/api/auth/login", "/login"], async (req, res) => {
  try {
    const rawUsername = req.body?.username;
    const rawPassword = req.body?.password;
    const username = typeof rawUsername === "string" ? rawUsername.trim() : "";
    const password = typeof rawPassword === "string" ? rawPassword.trim() : "";

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    const user = db
      .prepare(
        "SELECT id, username, password as hashed_password, role, level, name, status FROM users WHERE TRIM(username) = ? COLLATE NOCASE OR TRIM(name) = ? COLLATE NOCASE",
      )
      .get(username, username) as any;

    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    let isMatch = false;
    const storedHash = String(user.hashed_password || "");
    if (
      storedHash.startsWith("$2b$") ||
      storedHash.startsWith("$2a$") ||
      storedHash.startsWith("$2y$")
    ) {
      isMatch = await bcrypt.compare(password, storedHash);
    }

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (user.status === "REJECTED") {
      return res.status(403).json({
        error:
          "Your account request was rejected by Full Control. Please contact your administrator.",
      });
    }

    if (
      user.status &&
      user.status !== "APPROVED" &&
      user.status !== "ACTIVE"
    ) {
      return res.status(403).json({
        error: "Your account is pending approval by Full Control.",
      });
    }

    const isMobileClient =
      String(req.headers["x-client-platform"] || "").toLowerCase() === "mobile-app" ||
      Boolean(req.body?.isMobileApp);

    if (String(user.role || "").trim().toUpperCase() === "OPERATOR" && !isMobileClient) {
      return res.status(403).json({
        error:
          "Akun Operator Produksi tidak diperuntukkan mengakses Web Back-Office ERP & HRIS. Silakan login melalui Aplikasi Mobile (Android / iOS) untuk akses Message, ESS, dan Shop Floor.",
        code: "OPERATOR_MOBILE_ONLY",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        level: user.level,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    const isHttps =
      req.secure ||
      req.headers["x-forwarded-proto"] === "https" ||
      process.env.NODE_ENV === "production";

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? "none" : "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000,
    });

    delete user.hashed_password;
    res.json({ success: true, user, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get(["/api/auth/me", "/me"], (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = db
    .prepare(
      "SELECT id, username, role, level, name, status FROM users WHERE id = ?",
    )
    .get(authReq.userId) as any;

  if (
    !user ||
    (user.status && user.status !== "APPROVED" && user.status !== "ACTIVE")
  ) {
    return res
      .status(401)
      .json({ error: "Session invalid or account suspended" });
  }
  res.json({ success: true, user });
});

router.post(["/api/auth/register", "/register"], async (req, res) => {
  try {
    const rawUsername = req.body?.username;
    const rawPassword = req.body?.password;
    const { role, level, name } = req.body || {};
    const username = typeof rawUsername === "string" ? rawUsername.trim() : "";
    const password = typeof rawPassword === "string" ? rawPassword : "";

    if (!username || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const requestedRole = (role || "STAFF").toString().trim().toUpperCase();
    const FORBIDDEN_SELF_ROLES = [
      "FC",
      "BOD",
      "DIRECTOR",
      "ADMIN",
      "SUPERADMIN",
      "GOD_MODE",
    ];
    const assignedRole = FORBIDDEN_SELF_ROLES.includes(requestedRole)
      ? "STAFF"
      : requestedRole;
    const assignedLevel = FORBIDDEN_SELF_ROLES.includes(requestedRole)
      ? "STAFF"
      : level || "STAFF";

    const existingUser = db
      .prepare(
        "SELECT id, status FROM users WHERE TRIM(username) = ? COLLATE NOCASE",
      )
      .get(username) as any;

    if (existingUser) {
      if (existingUser.status === "REJECTED") {
        db.prepare("DELETE FROM users WHERE id = ?").run(existingUser.id);
      } else {
        return res.status(400).json({ error: "Username already exists" });
      }
    }

    const id = "USER-" + Math.random().toString(36).substr(2, 9);
    const hashedPassword = await bcrypt.hash(password, 12);

    db.prepare(
      `
        INSERT INTO users (id, username, password, role, level, name, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
      `,
    ).run(
      id,
      username,
      hashedPassword,
      assignedRole,
      assignedLevel,
      (name || username).toString().trim(),
    );

    db.prepare(
      "INSERT OR IGNORE INTO chat_participants (thread_id, username) VALUES ('THREAD-GENERAL', ?)",
    ).run(username);

    res.json({
      success: true,
      message: "Account request submitted. Please wait for FC approval.",
    });
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "Username already exists" });
    }
    console.error(error);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.get(
  ["/api/auth/pending", "/pending"],
  requireRole(["FC"]),
  (_req, res) => {
    try {
      const users = db
        .prepare(
          "SELECT id, username, role, level, name, status, created_at FROM users WHERE status = 'PENDING' ORDER BY created_at DESC",
        )
        .all();
      res.json(users);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch pending accounts" });
    }
  },
);

router.post(
  ["/api/auth/approve", "/approve"],
  requireRole(["FC"]),
  (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.body;
      const targetUser = db
        .prepare("SELECT username, name FROM users WHERE id = ?")
        .get(id) as any;

      db.prepare(
        "UPDATE users SET status = 'APPROVED', is_approved = 1 WHERE id = ?",
      ).run(id);

      if (targetUser) {
        logAudit(
          req.username || req.user?.username || "FC",
          "APPROVE_ACCOUNT",
          "USER",
          id,
          `Approved account for ${targetUser.username}`,
        );
        const msgId = "MSG-" + Math.random().toString(36).substr(2, 9);
        db.prepare(
          `
          INSERT INTO chat_messages (id, thread_id, sender_username, content) 
          VALUES (?, ?, ?, ?)
        `,
        ).run(
          msgId,
          "THREAD-GENERAL",
          "SYSTEM",
          `Welcome to the team, **${targetUser.name || targetUser.username}**! 👋 We're excited to have you onboard — feel free to say hello and introduce yourself here! ✨`,
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to approve account" });
    }
  },
);

router.post(
  ["/api/auth/reject", "/reject"],
  requireRole(["FC"]),
  (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.body;
      const targetUser = db
        .prepare("SELECT username, name FROM users WHERE id = ?")
        .get(id) as any;

      db.prepare("UPDATE users SET status = 'REJECTED' WHERE id = ?").run(id);

      if (targetUser) {
        logAudit(
          req.username || req.user?.username || "FC",
          "REJECT_ACCOUNT",
          "USER",
          id,
          `Rejected account for ${targetUser.username}`,
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to reject account" });
    }
  },
);

export default router;
