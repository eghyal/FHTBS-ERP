import {
  runFullMigration,
  migrateSingleTable,
  getMigrationState,
  MIGRATABLE_TABLES,
} from "./migrator.ts";
import { getPgEngineInfo } from "./postgresClient.ts";
import {
  getSupabaseServerStatus,
  initializeSupabaseSchema,
} from "./postgresBridge.ts";

/**
 * Curated 2-Engine PostgreSQL Migrator Facade
 * Bridges `/api/postgres/*` endpoints directly to the Supabase Cloud PostgreSQL engine.
 */
export async function syncAllTablesToPostgres() {
  await initializeSupabaseSchema();
  const summary = await runFullMigration();
  const pgInfo = getPgEngineInfo();
  return {
    batchId: summary.batchId,
    engineMode: pgInfo.mode,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    totalTables: summary.totalTables,
    totalRowsSynced: summary.totalRows,
    status: summary.overallStatus,
    results: summary.results.map((r) => ({
      tableName: r.tableName,
      sqliteRows: r.rowCount,
      pgRowsSynced: r.migratedCount,
      checksum: r.checksum,
      status: r.status,
      durationMs: r.durationMs,
      error: r.error,
    })),
  };
}

export async function syncSingleTableToPostgres(
  tableName: string,
  pkColumn = "id",
) {
  const found = MIGRATABLE_TABLES.find((t) => t.table === tableName);
  const res = await migrateSingleTable(
    tableName,
    found ? found.pk : pkColumn,
  );
  return {
    tableName: res.tableName,
    sqliteRows: res.rowCount,
    pgRowsSynced: res.migratedCount,
    checksum: res.checksum,
    status: res.status,
    durationMs: res.durationMs,
    error: res.error,
  };
}

export async function getPostgresMigrationStatus() {
  const state = getMigrationState();
  const supaStatus = await getSupabaseServerStatus();
  return {
    engine: getPgEngineInfo(),
    supabase: supaStatus,
    isRunning: state.isMigrationRunning,
    pgDocumentStoreCount: supaStatus.erpSyncTable?.rowCount || 0,
    lastBatch: state.lastSummary,
  };
}
