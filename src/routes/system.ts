import express from "express";
import db from "../db/database.ts";
import { getFirestoreSyncStatus } from "../db/firebaseSync.ts";
import { getPostgresBridgeStats } from "../db/postgresBridge.ts";
import {
  getOutboxTelemetry,
  processOutboxBatch,
  replayDeadLetterQueue,
} from "../services/outboxService.ts";

const router = express.Router();

// Health & clock endpoints
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get("/time", (_req, res) => {
  res.json({
    iso: new Date().toISOString(),
    epochMs: Date.now(),
    timezone: "Asia/Jakarta",
  });
});

// Audit trail & logs endpoints
router.get(["/audit-trail", "/logs"], (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 500, 2000);
    const rows = db
      .prepare("SELECT * FROM audit_trail ORDER BY created_at DESC LIMIT ?")
      .all(limit);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch audit trail" });
  }
});

// Outbox telemetry & recovery endpoints
router.get(["/sync/outbox/telemetry", "/sync/outbox/status"], (_req, res) => {
  res.json(getOutboxTelemetry());
});

router.post("/sync/outbox/process", async (_req, res) => {
  try {
    const result = await processOutboxBatch(50);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to process outbox batch" });
  }
});

router.post(["/sync/outbox/replay", "/sync/outbox/replay-dlq"], (_req, res) => {
  const replayed = replayDeadLetterQueue();
  res.json({ success: true, replayed });
});

// Endpoint to verify curated 2-Engine Architecture (Local SQLite + Supabase Cloud PostgreSQL)
router.get("/system/status", (_req, res) => {
  let dbStatus = "DISCONNECTED";
  let stats = {
    users: 0,
    projects: 0,
    items: 0,
    spks: 0,
    quotations: 0,
  };

  try {
    const safeCount = (tableName: string): number => {
      try {
        const r = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
        return r?.count || 0;
      } catch {
        return 0;
      }
    };

    stats = {
      users: safeCount("users"),
      projects: safeCount("projects"),
      items: safeCount("items"),
      spks: safeCount("spks"),
      quotations: safeCount("quotations"),
    };
    dbStatus = "CONNECTED";
  } catch (e) {
    console.error("Database status check failed:", e);
    dbStatus = "ERROR";
  }

  const fbSync = getFirestoreSyncStatus();
  const pgStats = getPostgresBridgeStats();

  res.json({
    architecture: "2-ENGINE (Local SQLite + Supabase Cloud PostgreSQL)",
    backend: {
      status: "ONLINE",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      framework: "Express + TypeScript + Vite",
    },
    database: {
      status: dbStatus,
      engine: "SQLite3 (Local Transactional) + Supabase PostgreSQL (Cloud Sync)",
      file: "erp.db",
      stats,
    },
    firebase: {
      ...fbSync,
    },
    postgres: {
      ...pgStats,
    },
    frontend: {
      framework: "React 19 + Tailwind CSS + Lucide",
      status: "ACTIVE",
    },
  });
});

export default router;
