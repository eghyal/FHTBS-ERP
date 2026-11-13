import sqliteDb from "./database.ts";
import {
  replicateToPostgres,
  batchReplicateToPostgres,
  deleteFromPostgres,
  supabaseServerClient,
} from "./postgresBridge.ts";

/**
 * Curated 2-Engine Architecture Modes:
 * - DUAL_SYNC (Hybrid SQLite + Supabase PostgreSQL Cloud Sync)
 * - FIRESTORE_FIRST (Cloud-Primary reading/writing Supabase PostgreSQL first, kept alias for compatibility)
 * - SQLITE_ONLY (Local SQLite only)
 */
export type DbMode = "FIRESTORE_FIRST" | "DUAL_SYNC" | "SQLITE_ONLY";

let currentMode: DbMode = "DUAL_SYNC";

export function setDbMode(mode: DbMode) {
  currentMode = mode;
  console.log(
    `[DatabaseEngine] Switched operational mode to: ${mode} (2-Engine: Local SQLite + Supabase PostgreSQL)`,
  );
}

export function getDbMode(): DbMode {
  return currentMode;
}

/**
 * Unified 2-Engine Database Adapter (Local SQLite + Supabase Cloud PostgreSQL)
 */
export const hybridDb = {
  /**
   * Read all documents from a table/collection
   */
  async readCollection<T = any>(
    collectionName: string,
    sqliteFallbackQuery?: string,
    params: any[] = [],
  ): Promise<T[]> {
    if (currentMode === "FIRESTORE_FIRST") {
      try {
        const { data, error } = await supabaseServerClient
          .from("erp_sync_records")
          .select("record_id, payload")
          .eq("collection_name", collectionName)
          .limit(1000);

        if (!error && data && data.length > 0) {
          return data.map((row) => ({
            id: row.record_id,
            ...(row.payload || {}),
          })) as T[];
        }
      } catch (err: any) {
        console.warn(
          `[HybridDB] Cloud-primary read fallback to SQLite on ${collectionName}:`,
          err?.message,
        );
      }
    }

    const sql = sqliteFallbackQuery || `SELECT * FROM ${collectionName}`;
    return sqliteDb.prepare(sql).all(...params) as T[];
  },

  /**
   * Read single document by ID
   */
  async readDoc<T = any>(
    collectionName: string,
    docId: string | number,
    idColumn = "id",
  ): Promise<T | null> {
    if (currentMode === "FIRESTORE_FIRST") {
      try {
        const { data, error } = await supabaseServerClient
          .from("erp_sync_records")
          .select("record_id, payload")
          .eq("collection_name", collectionName)
          .eq("record_id", String(docId))
          .maybeSingle();

        if (!error && data && data.payload) {
          return { id: data.record_id, ...data.payload } as T;
        }
      } catch {
        // Fallback to local SQLite
      }
    }

    try {
      const row = sqliteDb
        .prepare(`SELECT * FROM ${collectionName} WHERE ${idColumn} = ?`)
        .get(docId);
      return (row as T) || null;
    } catch {
      return null;
    }
  },

  /**
   * Write/Upsert a single document to Supabase Cloud PostgreSQL (`public.erp_sync_records`)
   */
  async write(
    collectionName: string,
    docId: string | number,
    data: Record<string, any>,
  ): Promise<boolean> {
    if (currentMode === "SQLITE_ONLY") return true;
    return replicateToPostgres(collectionName, String(docId), data);
  },

  /**
   * High-speed batch write to Supabase Cloud PostgreSQL (`public.erp_sync_records`)
   */
  async batchWrite(
    collectionName: string,
    items: { id: string; data: Record<string, any> }[],
    checksum?: string,
  ): Promise<number> {
    if (currentMode === "SQLITE_ONLY" || items.length === 0) return 0;
    return batchReplicateToPostgres(collectionName, items, checksum);
  },

  /**
   * Delete a document from Supabase Cloud PostgreSQL (`public.erp_sync_records`)
   */
  async remove(
    collectionName: string,
    docId: string | number,
  ): Promise<boolean> {
    if (currentMode === "SQLITE_ONLY") return true;
    return deleteFromPostgres(collectionName, String(docId));
  },
};
