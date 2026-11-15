import pg from "pg";

const { Pool } = pg;

export type PostgresEngineMode = "EXTERNAL_PG" | "SUPABASE_REST";

let pgPool: pg.Pool | null = null;
let currentMode: PostgresEngineMode = "SUPABASE_REST";
let isInitialized = false;
let lastDirectPgError: string | null = null;
let schemaAutoInitialized = false;

const DEFAULT_SUPABASE_POOLER_URL =
  "<REDACTED_CONFIGURE_VIA_SERVER_ENV_DATABASE_URL>";

export function getConfiguredPostgresUrl(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    DEFAULT_SUPABASE_POOLER_URL
  ).trim();
}

/**
 * Initializes the PostgreSQL connection layer for the curated 2-Engine Architecture:
 * - Engine 1: Local SQLite (better-sqlite3) for <1ms synchronous transactional queries
 * - Engine 2: Supabase Cloud PostgreSQL (via @supabase/supabase-js REST SDK + optional direct pg.Pool)
 *
 * Legacy PGlite WebAssembly local emulator has been retired.
 */
export async function getPgDb(): Promise<{
  mode: PostgresEngineMode;
  pool: pg.Pool | null;
}> {
  if (isInitialized) {
    return { mode: currentMode, pool: pgPool };
  }

  const externalUrl = getConfiguredPostgresUrl();

  if (externalUrl) {
    try {
      console.log(
        "[PostgresEngine] Connecting to direct Supabase PostgreSQL via DATABASE_URL...",
      );
      pgPool = new Pool({
        connectionString: externalUrl,
        ssl:
          externalUrl.includes("localhost") || externalUrl.includes("127.0.0.1")
            ? false
            : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3500,
      });

      pgPool.on("error", (poolErr: any) => {
        lastDirectPgError = poolErr?.message || String(poolErr);
        console.warn(
          "[PostgresEngine] Background pool client notice:",
          lastDirectPgError,
        );
      });

      const client = await pgPool.connect();
      await client.query("SELECT 1");
      client.release();

      currentMode = "EXTERNAL_PG";
      lastDirectPgError = null;
      isInitialized = true;
      console.log(
        "[PostgresEngine] Direct Supabase PostgreSQL Pool connected (EXTERNAL_PG).",
      );
      return { mode: currentMode, pool: pgPool };
    } catch (err: any) {
      lastDirectPgError = err?.message || String(err);
      console.warn(
        "[PostgresEngine] Direct PostgreSQL connection failed, operating via Supabase REST SDK:",
        lastDirectPgError,
      );
      if (pgPool) {
        try {
          await pgPool.end();
        } catch {
          // ignore cleanup error
        }
      }
      pgPool = null;
    }
  }

  currentMode = "SUPABASE_REST";
  isInitialized = true;
  console.log(
    "[PostgresEngine] Operating in Curated 2-Engine Mode (Local SQLite + Supabase Cloud REST SDK).",
  );
  return { mode: currentMode, pool: null };
}

export function isDirectPgConnected(): boolean {
  return currentMode === "EXTERNAL_PG" && pgPool !== null;
}

/**
 * Automatically executes the idempotent Supabase SQL setup script (DDL + RLS policies)
 * when a direct PostgreSQL connection string (DATABASE_URL / SUPABASE_DB_URL) is configured.
 */
export async function autoInitializeSupabaseSchemaViaPool(
  sqlScript: string,
): Promise<{
  executed: boolean;
  mode: PostgresEngineMode;
  error?: string;
}> {
  const { mode, pool } = await getPgDb();
  if (mode !== "EXTERNAL_PG" || !pool) {
    return {
      executed: false,
      mode,
      error:
        lastDirectPgError ||
        "DATABASE_URL / SUPABASE_DB_URL is not configured. Using Supabase REST SDK (run SQL Setup Script once in Supabase SQL Editor, or set DATABASE_URL for auto-DDL).",
    };
  }

  try {
    await pool.query(sqlScript);
    schemaAutoInitialized = true;
    console.log(
      "[PostgresEngine] Auto-DDL completed: public.todos and public.erp_sync_records verified on Supabase PostgreSQL.",
    );
    return { executed: true, mode };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    lastDirectPgError = errMsg;
    console.error("[PostgresEngine] Auto-DDL execution failed:", errMsg);
    return { executed: false, mode, error: errMsg };
  }
}

/**
 * Execute parameterized SQL against direct PostgreSQL pool when connected
 */
export async function pgQuery<T = any>(
  sql: string,
  params: any[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const { mode, pool } = await getPgDb();

  if (mode === "EXTERNAL_PG" && pool) {
    const res = await pool.query(sql, params);
    return { rows: res.rows as T[], rowCount: res.rowCount || 0 };
  }

  return { rows: [], rowCount: 0 };
}

/**
 * Execute raw multi-statement DDL / script when direct PostgreSQL pool is connected
 */
export async function pgExec(sql: string): Promise<void> {
  const { mode, pool } = await getPgDb();

  if (mode === "EXTERNAL_PG" && pool) {
    await pool.query(sql);
  }
}

export function getPgEngineInfo() {
  return {
    isInitialized,
    mode: currentMode,
    directPgConnected: isDirectPgConnected(),
    schemaAutoInitialized,
    lastDirectPgError,
    engineName:
      currentMode === "EXTERNAL_PG"
        ? "Supabase Cloud PostgreSQL (Direct Pool + REST SDK)"
        : "Supabase Cloud PostgreSQL (REST SDK + Local SQLite Engine)",
    storagePath: "https://wxyfgfqaiqrfeofxemgu.supabase.co",
  };
}
