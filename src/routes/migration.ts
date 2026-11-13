import express from "express";
import {
  runFullMigration,
  migrateSingleTable,
  getSQLiteTableStats,
  getMigrationState,
  MIGRATABLE_TABLES,
} from "../db/migrator.ts";
import { getDbMode, setDbMode, type DbMode } from "../db/firestoreAdapter.ts";
import { getFirestoreSyncStatus } from "../db/firebaseSync.ts";
import {
  syncAllTablesToPostgres,
  syncSingleTableToPostgres,
  getPostgresMigrationStatus,
} from "../db/pgMigrator.ts";
import {
  getPostgresBridgeStats,
  getSupabaseServerStatus,
  SUPABASE_SQL_SETUP_SCRIPT,
  rehydrateSqliteFromSupabase,
  pullPostgresDeltasToSqlite,
  initializeSupabaseSchema,
  enforceServiceRoleRlsOnErpSync,
} from "../db/postgresBridge.ts";
import {
  getSqliteWalTelemetry,
  runSqliteWalCheckpoint,
} from "../db/database.ts";

const router = express.Router();

const mapInternalModeToUi = (mode: DbMode): string => {
  if (mode === "FIRESTORE_FIRST") return "FIRESTORE_PRIMARY";
  if (mode === "SQLITE_ONLY") return "SQLITE_FALLBACK";
  return "HYBRID_SYNC";
};

/**
 * GET /api/migration/status
 * Returns live status of the curated 2-Engine Architecture (Local SQLite + Supabase Cloud PostgreSQL)
 */
router.get("/migration/status", async (_req, res) => {
  try {
    const tableStats = getSQLiteTableStats();
    const state = getMigrationState();
    const syncStats = getFirestoreSyncStatus();
    const pgStats = getPostgresBridgeStats();
    const totalSQLiteRecords = tableStats.reduce((sum, t) => sum + t.rowCount, 0);

    res.json({
      architecture:
        "ENTERPRISE HYBRID (PostgreSQL Primary SSOT + SQLite WAL Secondary Cache)",
      dbMode: mapInternalModeToUi(getDbMode()),
      internalMode: getDbMode(),
      isMigrationRunning: state.isMigrationRunning,
      lastSummary: state.lastSummary,
      syncStats,
      postgresStats: pgStats,
      sqliteWal: getSqliteWalTelemetry(),
      totalSQLiteRecords,
      totalTablesCount: tableStats.length,
      tableStats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/migration/start
 * Triggers full batch migration from SQLite to Supabase Cloud PostgreSQL (`public.erp_sync_records`)
 */
router.post("/migration/start", async (_req, res) => {
  try {
    const summary = await runFullMigration();
    res.json({
      success: true,
      message:
        "Sinkronisasi penuh SQLite ke Supabase Cloud PostgreSQL berhasil dijalankan.",
      summary,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/migration/table/:tableName
 * Migrates a single table on demand to Supabase Cloud PostgreSQL
 */
router.post("/migration/table/:tableName", async (req, res) => {
  try {
    const { tableName } = req.params;
    const found = MIGRATABLE_TABLES.find((t) => t.table === tableName);
    const pk = found ? found.pk : "id";

    const result = await migrateSingleTable(tableName, pk);
    res.json({
      success: result.status === "SUCCESS",
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/migration/mode
 * Switch database operational mode
 */
router.post("/migration/mode", (req, res) => {
  const { mode } = req.body;
  const modeMap: Record<string, DbMode> = {
    FIRESTORE_FIRST: "FIRESTORE_FIRST",
    DUAL_SYNC: "DUAL_SYNC",
    SQLITE_ONLY: "SQLITE_ONLY",
    FIRESTORE_PRIMARY: "FIRESTORE_FIRST",
    HYBRID_SYNC: "DUAL_SYNC",
    SQLITE_FALLBACK: "SQLITE_ONLY",
  };
  const resolvedMode = modeMap[String(mode || "")];
  if (!resolvedMode) {
    return res.status(400).json({
      error: "Invalid mode. Allowed: HYBRID_SYNC, FIRESTORE_PRIMARY, SQLITE_FALLBACK",
    });
  }

  setDbMode(resolvedMode);
  res.json({
    success: true,
    currentMode: mapInternalModeToUi(getDbMode()),
    internalMode: getDbMode(),
  });
});

// ============================================================================
// SUPABASE CLOUD POSTGRESQL ENDPOINTS (2-Engine Architecture)
// ============================================================================

/**
 * GET /api/postgres/status
 */
router.get("/postgres/status", async (_req, res) => {
  try {
    const status = await getPostgresMigrationStatus();
    const bridge = getPostgresBridgeStats();
    res.json({
      ...status,
      bridge,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/postgres/sync
 */
router.post("/postgres/sync", async (_req, res) => {
  try {
    const summary = await syncAllTablesToPostgres();
    res.json({
      success: true,
      message: "Synchronized all ERP tables to Supabase PostgreSQL.",
      summary,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/postgres/table/:tableName
 */
router.post("/postgres/table/:tableName", async (req, res) => {
  try {
    const { tableName } = req.params;
    const result = await syncSingleTableToPostgres(tableName);
    res.json({
      success: result.status === "SUCCESS",
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/supabase/status
 * Inspects live Supabase PostgreSQL connection, `todos` table, and `erp_sync_records`
 */
router.get("/supabase/status", async (_req, res) => {
  try {
    const status = await getSupabaseServerStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({
      connected: false,
      error: err.message,
      sqlSetupScript: SUPABASE_SQL_SETUP_SCRIPT,
    });
  }
});

/**
 * POST /api/supabase/init-schema
 * Automatically runs the DDL setup script on Supabase PostgreSQL if DATABASE_URL / SUPABASE_DB_URL is set,
 * or returns the SQL setup script if operating in REST-only mode.
 */
router.post("/supabase/init-schema", async (_req, res) => {
  try {
    const result = await initializeSupabaseSchema();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      autoExecuted: false,
      error: err.message,
      sqlScript: SUPABASE_SQL_SETUP_SCRIPT,
    });
  }
});

/**
 * POST /api/supabase/harden-rls
 * Enforces strict service_role-only RLS policy on public.erp_sync_records via DATABASE_URL
 */
router.post("/supabase/harden-rls", async (_req, res) => {
  try {
    const result = await enforceServiceRoleRlsOnErpSync();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      lockedToServiceRole: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/supabase/rehydrate
 * Pulls and restores ERP records from Supabase `public.erp_sync_records` into local SQLite.
 */
router.post("/supabase/rehydrate", async (req, res) => {
  try {
    const targetTable =
      typeof req.body?.table === "string" && req.body.table.trim()
        ? req.body.table.trim()
        : undefined;

    const result = await rehydrateSqliteFromSupabase(targetTable);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      ...result,
      message: targetTable
        ? `Berhasil memulihkan ${result.totalRestoredRows} baris untuk tabel '${targetTable}' dari Supabase PostgreSQL ke SQLite lokal.`
        : `Berhasil memulihkan ${result.totalRestoredRows} baris pada ${result.tablesRestored} tabel dari Supabase PostgreSQL ke SQLite lokal.`,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/supabase/sync-table/:tableName
 * Batch-pushes all rows of a specific SQLite table to Supabase `public.erp_sync_records`
 */
router.post("/supabase/sync-table/:tableName", async (req, res) => {
  try {
    const { tableName } = req.params;
    const validTable = MIGRATABLE_TABLES.find((t) => t.table === tableName);
    if (!validTable) {
      return res
        .status(400)
        .json({ error: `Table '${tableName}' is not in MIGRATABLE_TABLES` });
    }

    const result = await migrateSingleTable(tableName, validTable.pk);
    if (result.status === "FAILED") {
      return res.status(400).json({
        success: false,
        tableName,
        syncedCount: 0,
        totalRows: result.rowCount,
        error: result.error,
      });
    }

    res.json({
      success: true,
      tableName,
      syncedCount: result.migratedCount,
      totalRows: result.rowCount,
      checksum: result.checksum,
      message: `Synced ${result.migratedCount}/${result.rowCount} records from '${tableName}' to Supabase PostgreSQL.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/supabase/sync-all
 * Batch-pushes core ERP tables from SQLite into Supabase `public.erp_sync_records`
 */
router.post("/supabase/sync-all", async (_req, res) => {
  try {
    const coreTables = [
      "items",
      "inventory",
      "projects",
      "spks",
      "quotations",
      "purchase_requests",
      "pr_items",
      "procurement_plans",
      "procurement_plan_items",
      "purchase_orders",
      "customers",
      "suppliers",
      "work_centers",
      "production_stations",
      "finance_transactions",
      "journal_entries",
    ];

    let totalSynced = 0;
    const summary: Array<{
      table: string;
      synced: number;
      total: number;
      status: string;
    }> = [];

    for (const tableName of coreTables) {
      const cfg = MIGRATABLE_TABLES.find((t) => t.table === tableName);
      if (!cfg) continue;

      const resTable = await migrateSingleTable(tableName, cfg.pk);
      totalSynced += resTable.migratedCount;
      summary.push({
        table: tableName,
        synced: resTable.migratedCount,
        total: resTable.rowCount,
        status: resTable.status,
      });
    }

    res.json({
      success: true,
      totalSynced,
      tablesProcessed: summary.length,
      summary,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/supabase/delta-sync
 * Pulls incremental delta changes (synced_at > last_delta_watermark) from PostgreSQL Primary SSOT
 * into the local SQLite WAL Secondary Cache.
 */
router.post("/supabase/delta-sync", async (_req, res) => {
  try {
    const result = await pullPostgresDeltasToSqlite();
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({
      ...result,
      message:
        result.pulledRows > 0
          ? `Pulled ${result.pulledRows} incremental delta records across ${result.tablesUpdated} tables from PostgreSQL Primary SSOT into SQLite WAL Cache.`
          : "SQLite WAL Secondary Cache is 100% in sync with PostgreSQL Primary SSOT (0 pending deltas).",
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/sqlite/wal-checkpoint
 * Runs an on-demand WAL checkpoint on the in-process SQLite Secondary Cache.
 */
router.post("/sqlite/wal-checkpoint", (req, res) => {
  try {
    const mode = String(req.body?.mode || "PASSIVE").toUpperCase() as
      | "PASSIVE"
      | "FULL"
      | "RESTART"
      | "TRUNCATE";
    const result = runSqliteWalCheckpoint(mode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
