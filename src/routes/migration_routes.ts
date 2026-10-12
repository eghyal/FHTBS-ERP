import { Router } from "express";
import db from "../db/database.ts";
import { hybridDb, type DatabaseMode } from "../db/firestoreAdapter.ts";
import { requireRole } from "../middleware/auth.ts";
import { 
  runFullMigration, 
  migrateSingleTable, 
  getMigrationState, 
  MIGRATION_TABLES 
} from "../db/migrationEngine.ts";
import { getSyncQueueStats } from "../db/firebaseSync.ts";
import {
  runFullPostgresMigration,
  migrateTableToPostgres,
  getPostgresMigrationState,
} from "../db/postgresMigrationEngine.ts";
import { getPostgresBridgeStats } from "../db/postgresBridge.ts";
import { isPostgresReady, getPostgresMode, postgresQuery } from "../db/postgresClient.ts";

export const router = Router();

// Protect only migration and postgres database management endpoints
router.use((req, res, next) => {
  if (req.path.startsWith("/api/postgres") || req.path.startsWith("/api/migration")) {
    return requireRole(["FC", "ADMIN", "SUPERADMIN"])(req as any, res, next);
  }
  next();
});

// ==========================================
// POSTGRESQL MIGRATION & TELEMETRY ENDPOINTS
// ==========================================

router.get("/api/postgres/status", async (req, res) => {
  try {
    const bridgeStats = getPostgresBridgeStats();
    const migrationState = getPostgresMigrationState();
    const ready = isPostgresReady();
    const mode = getPostgresMode();

    let postgresTables: any[] = [];
    if (ready) {
      try {
        const tableQuery = await postgresQuery(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
        );
        postgresTables = tableQuery.rows.map((r: any) => r.table_name);
      } catch (err) {
        console.warn("[PostgreSQL] Error querying tables:", err);
      }
    }

    res.json({
      status: "ok",
      isReady: ready,
      engineMode: mode,
      tableCount: postgresTables.length,
      tables: postgresTables,
      bridgeStats,
      migrationState,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to retrieve PostgreSQL status" });
  }
});

router.post("/api/postgres/migrate", async (req, res) => {
  try {
    const summary = await runFullPostgresMigration();
    res.json({
      message: "PostgreSQL full migration completed successfully.",
      summary,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "PostgreSQL migration failed" });
  }
});

router.post("/api/postgres/table/:tableName", async (req, res) => {
  try {
    const { tableName } = req.params;
    const result = await migrateTableToPostgres(tableName);
    res.json({
      message: `Table ${tableName} migrated to PostgreSQL with status: ${result.status}`,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to migrate table to PostgreSQL" });
  }
});

// 1. Get complete migration and sync telemetry status
router.get("/api/migration/status", async (req, res) => {
  try {
    const state = getMigrationState();
    const syncStats = getSyncQueueStats();

    // Query table row counts from SQLite for live dashboard comparison
    const tableStats = MIGRATION_TABLES.map(table => {
      let rowCount = 0;
      let exists = false;
      try {
        const check = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
        if (check) {
          exists = true;
          const countRes = db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as any;
          rowCount = countRes?.count || 0;
        }
      } catch {
        // Table not present or error
      }
      return { table, exists, rowCount };
    });

    // Attempt to fetch latest migration summary from Firestore if not in memory
    let lastSummary = state.lastSummary;
    if (!lastSummary) {
      try {
        const logs = await hybridDb.query("migration_logs", [
          { field: "table_name", op: "==", value: "_TOTAL_SUMMARY_" }
        ], 1);
        if (logs.length > 0) {
          lastSummary = logs[0].summary_data || logs[0];
        }
      } catch {
        // Fallback gracefully
      }
    }

    res.json({
      dbMode: hybridDb.getMode(),
      isMigrationRunning: state.isMigrationRunning,
      lastSummary,
      syncStats,
      tableStats,
      totalSQLiteRecords: tableStats.reduce((acc, t) => acc + t.rowCount, 0)
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// 2. Trigger Total Migration Execution (Permanently disabled for Zero-Trust data privacy)
router.post("/api/migration/start", async (_req, res) => {
  return res.json({
    message: "Legacy Firestore cloud sync has been retired. Relational data is secured in single-source SQLite/PostgreSQL.",
    status: "DISABLED",
    summary: { totalMigratedRows: 0, totalTables: 0, status: "DISABLED" }
  });
});

// 3. Migrate a single specific table (Permanently disabled)
router.post("/api/migration/table/:tableName", async (req, res) => {
  const { tableName } = req.params;
  return res.json({
    message: `Migration for table ${tableName} to Firestore is disabled for security hardening.`,
    status: "DISABLED",
    result: { table: tableName, status: "DISABLED", count: 0 }
  });
});

// 4. Update Database Mode (Locked to local relational storage)
router.post("/api/migration/mode", (_req, res) => {
  return res.json({
    message: "Database mode is permanently locked to local relational database for data integrity.",
    currentMode: "SQLITE_FALLBACK"
  });
});

export default router;
