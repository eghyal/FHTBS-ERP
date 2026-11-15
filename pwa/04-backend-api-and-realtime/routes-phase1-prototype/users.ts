import { Router } from "express";
import bcrypt from "bcrypt";
import db from "../db/database.ts";
import { requireRole, getActor } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { deleteDocFromFirestore } from "../db/firebaseSync.ts";

export const usersRouter = Router();

usersRouter.get(["/api/users", "/api/users/all"], requireRole(["FC", "ADMIN", "HR", "BOD", "DIRECTOR"]), (req, res) => {
  try {
    const users = db
      .prepare(
        `SELECT id, username, role, level, name, status, created_at,
                employee_no, nik_ktp, npwp, ptkp_status, bank_name, bank_account_number,
                contract_type, join_date, contract_end_date, work_center_id
         FROM users WHERE status != 'PENDING' ORDER BY name ASC`,
      )
      .all();
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

usersRouter.put("/api/users/:id/role", requireRole(["FC", "ADMIN", "SUPERADMIN", "DIRECTOR", "BOD"]), async (req, res) => {
  try {
    const { role, level, newPassword } = req.body;
    const validLevels = ["STAFF", "SUPERVISOR", "MANAGER"];
    const normalizedLevel = validLevels.includes(String(level || "").toUpperCase())
      ? String(level).toUpperCase()
      : "STAFF";

    const targetUser = db
      .prepare("SELECT role, username FROM users WHERE id = ?")
      .get(req.params.id) as any;
    const actorUsername = ((req as any).username || "").toLowerCase();
    if (
      targetUser &&
      targetUser.role === "FC" &&
      actorUsername !== "eghy" &&
      actorUsername !== "ludy" &&
      actorUsername !== "admin"
    ) {
      return res
        .status(403)
        .json({ error: "Cannot modify FC accounts" });
    }
    db.prepare("UPDATE users SET role = ?, level = ? WHERE id = ?").run(
      role,
      normalizedLevel,
      req.params.id,
    );

    if (typeof newPassword === "string" && newPassword.trim().length > 0) {
      if (newPassword.trim().length < 6) {
        return res
          .status(400)
          .json({ error: "New passcode must be at least 6 characters" });
      }
      const hashed = await bcrypt.hash(newPassword.trim(), 12);
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(
        hashed,
        req.params.id,
      );
      logAudit(
        getActor(req),
        "UPDATE_PASSWORD_BCRYPT",
        "USER",
        req.params.id,
        `Updated bcrypt-12 passcode for ${targetUser?.username || req.params.id}`,
      );
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to update role" });
  }
});

usersRouter.put("/api/users/:id/password", requireRole(["FC"]), async (req, res) => {
  try {
    const rawPassword = typeof req.body?.password === "string" ? req.body.password.trim() : "";
    if (rawPassword.length < 6) {
      return res.status(400).json({ error: "Passcode must be at least 6 characters" });
    }
    const targetUser = db
      .prepare("SELECT id, username FROM users WHERE id = ?")
      .get(req.params.id) as any;
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    const hashed = await bcrypt.hash(rawPassword, 12);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, req.params.id);
    logAudit(
      getActor(req),
      "RESET_PASSWORD_BCRYPT",
      "USER",
      req.params.id,
      `Reset bcrypt-12 passcode for ${targetUser.username}`,
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to update password" });
  }
});

usersRouter.delete("/api/users/:id", requireRole(["FC"]), async (req, res) => {
  try {
    const userToDelete = db
      .prepare("SELECT id, username, role FROM users WHERE id = ?")
      .get(req.params.id) as any;
    if (!userToDelete) {
      return res.status(404).json({ error: "User not found" });
    }
    if (userToDelete.role === "FC") {
      const fcCount = db
        .prepare(
          "SELECT COUNT(*) as count FROM users WHERE role = 'FC' AND status = 'APPROVED'",
        )
        .get() as { count: number };
      if (fcCount.count <= 1) {
        return res
          .status(403)
          .json({ error: "Cannot delete the last FC account" });
      }
    }

    const username = userToDelete.username;
    const linkedManpower = db
      .prepare("SELECT id FROM production_manpower WHERE LOWER(TRIM(user_username)) = LOWER(TRIM(?))")
      .all(username) as Array<{ id: string }>;

    db.transaction(() => {
      db.pragma("foreign_keys = OFF");
      for (const mp of linkedManpower) {
        db.prepare("DELETE FROM production_manpower_assignments WHERE manpower_id = ?").run(mp.id);
        db.prepare("DELETE FROM production_manpower WHERE id = ?").run(mp.id);
      }
      db.prepare("DELETE FROM hr_salaries WHERE LOWER(TRIM(employee_username)) = LOWER(TRIM(?))").run(username);
      db.prepare("DELETE FROM hr_kpis WHERE LOWER(TRIM(employee_username)) = LOWER(TRIM(?))").run(username);
      db.prepare("DELETE FROM hr_leaves WHERE LOWER(TRIM(employee_username)) = LOWER(TRIM(?))").run(username);
      db.prepare("DELETE FROM hr_payslips WHERE LOWER(TRIM(employee_username)) = LOWER(TRIM(?))").run(username);
      db.prepare("DELETE FROM hr_handovers WHERE LOWER(TRIM(resigning_username)) = LOWER(TRIM(?))").run(username);
      db.prepare("DELETE FROM attendance_db.hr_attendances WHERE LOWER(TRIM(employee_username)) = LOWER(TRIM(?))").run(username);
      db.prepare("DELETE FROM chat_participants WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))").run(username);
      db.prepare("DELETE FROM user_drafts WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))").run(username);
      db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
      db.pragma("foreign_keys = ON");
    })();

    // Sync deletion to Cloud PostgreSQL SSOT
    await Promise.allSettled([
      deleteDocFromFirestore("users", req.params.id),
      ...linkedManpower.map((mp) => deleteDocFromFirestore("production_manpower", mp.id)),
    ]);

    logAudit(
      getActor(req),
      "PURGE_USER_PROFILE",
      "USER",
      req.params.id,
      `Purged user ${username} locally and from Cloud SSOT`,
    );

    res.json({ success: true });
  } catch (e: any) {
    console.error("Delete user error:", e);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

usersRouter.get("/api/users/directory", (req, res) => {
  try {
    const users = db
      .prepare(
        "SELECT id, username, name, role, level, status FROM users WHERE status = 'APPROVED' OR status IS NULL OR status = '' OR status = 'ACTIVE'",
      )
      .all();
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

usersRouter.put("/api/users/heartbeat", (req, res) => {
  try {
    const { device_type } = req.body;
    const username = getActor(req);
    if (!username || username === "SYSTEM") return res.status(401).json({ error: "Unauthorized" });

    try {
      const result = db
        .prepare(
          `
      UPDATE users 
      SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), device_type = ?
      WHERE LOWER(username) = LOWER(?)
    `,
        )
        .run(device_type || "Desktop", username);

      if (result.changes === 0) {
        console.warn(
          `Heartbeat: User ${username} not found in database (attempted with case-insensitive match)`,
        );
      }
    } catch (e) {
      console.warn("Heartbeat update failed, attempting partial update:", e);
      try {
        db.prepare(
          `UPDATE users SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE LOWER(username) = LOWER(?)`,
        ).run(username);
      } catch (innerE) {
        console.error("Heartbeat update critically failed:", innerE);
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error("Heartbeat route error:", e);
    res.status(500).json({ error: "Failed to update heartbeat" });
  }
});

usersRouter.post("/api/users/logout", (req, res) => {
  try {
    const authReq = req as any;
    const username = authReq.username || authReq.user?.username;
    if (username) {
      try {
        db.prepare(
          `UPDATE users SET last_seen_at = NULL WHERE LOWER(username) = LOWER(?)`,
        ).run(username);
      } catch (e) {
        console.error("Failed to clear last_seen_at on logout", e);
      }
    }

    const isHttps =
      req.secure ||
      req.headers["x-forwarded-proto"] === "https" ||
      process.env.NODE_ENV === "production";
    res.clearCookie("auth_token", {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? "none" : "lax",
      path: "/",
    });
    res.json({ success: true });
  } catch (e) {
    console.error("Logout route error:", e);
    res.status(500).json({ error: "Failed to process logout" });
  }
});


usersRouter.get("/api/users/status", (req, res) => {
  try {
    let users;
    try {
      users = db
        .prepare(
          `
      SELECT username, name, role, last_seen_at, device_type
      FROM users 
      WHERE status = 'APPROVED'
        AND UPPER(TRIM(COALESCE(role, ''))) != 'OPERATOR'
      ORDER BY CASE WHEN last_seen_at IS NOT NULL THEN 0 ELSE 1 END ASC, last_seen_at DESC, name ASC
    `,
        )
        .all();
    } catch (e) {
      console.warn("User status primary query failed, trying secondary fallback:", e);
      try {
        users = db
          .prepare(
            `
        SELECT username, name, role, last_seen_at
        FROM users 
        WHERE status = 'APPROVED'
          AND UPPER(TRIM(COALESCE(role, ''))) != 'OPERATOR'
        ORDER BY CASE WHEN last_seen_at IS NOT NULL THEN 0 ELSE 1 END ASC, last_seen_at DESC, name ASC
      `,
          )
          .all()
          .map((u: any) => ({ ...u, device_type: "Desktop" }));
      } catch (innerE) {
        console.warn("User status secondary query failed, trying final fallback:", innerE);
        users = db
          .prepare(
            `
        SELECT username, name, role
        FROM users 
        WHERE status = 'APPROVED'
          AND UPPER(TRIM(COALESCE(role, ''))) != 'OPERATOR'
        ORDER BY name ASC
      `,
          )
          .all()
          .map((u: any) => ({
            ...u,
            last_seen_at: null,
            device_type: "Desktop",
          }));
      }
    }
    res.json({
      users,
      server_time: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to fetch user status", e);
    res.status(500).json({ error: "Failed to fetch user status" });
  }
});

// Cross-device user drafts persistence (used by useAutoSave)
usersRouter.get("/api/user-drafts/:key", (req, res) => {
  try {
    const username = getActor(req);
    if (!username || username === "SYSTEM") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ error: "Draft key is required" });

    const row = db
      .prepare(
        "SELECT data, updated_at FROM user_drafts WHERE key = ? AND LOWER(TRIM(username)) = LOWER(TRIM(?)) LIMIT 1",
      )
      .get(key, username) as { data?: string; updated_at?: string } | undefined;

    if (!row || !row.data) {
      return res.json({ data: null });
    }
    try {
      return res.json({ data: JSON.parse(row.data), updated_at: row.updated_at });
    } catch {
      return res.json({ data: row.data, updated_at: row.updated_at });
    }
  } catch (e) {
    console.error("Failed to load user draft:", e);
    res.status(500).json({ error: "Failed to load user draft" });
  }
});

usersRouter.post("/api/user-drafts/:key", (req, res) => {
  try {
    const username = getActor(req);
    if (!username || username === "SYSTEM") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ error: "Draft key is required" });

    const payload = req.body?.data;
    const serialized = JSON.stringify(payload ?? null);

    db.prepare(
      `INSERT INTO user_drafts (key, username, data, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key, username) DO UPDATE SET
         data = excluded.data,
         updated_at = CURRENT_TIMESTAMP`,
    ).run(key, username.toLowerCase(), serialized);

    res.json({ success: true });
  } catch (e) {
    console.error("Failed to save user draft:", e);
    res.status(500).json({ error: "Failed to save user draft" });
  }
});

usersRouter.delete("/api/user-drafts/:key", (req, res) => {
  try {
    const username = getActor(req);
    if (!username || username === "SYSTEM") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ error: "Draft key is required" });

    db.prepare(
      "DELETE FROM user_drafts WHERE key = ? AND LOWER(TRIM(username)) = LOWER(TRIM(?))",
    ).run(key, username);

    res.json({ success: true });
  } catch (e) {
    console.error("Failed to delete user draft:", e);
    res.status(500).json({ error: "Failed to delete user draft" });
  }
});
