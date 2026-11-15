import crypto from "crypto";
import sqliteDb from "./database.ts";
import { hybridDb, setDbMode } from "./firestoreAdapter.ts";

export interface TableMigrationResult {
  tableName: string;
  rowCount: number;
  migratedCount: number;
  checksum: string;
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  durationMs: number;
  error?: string;
}

export interface FullMigrationSummary {
  batchId: string;
  startedAt: string;
  completedAt: string;
  totalTables: number;
  totalRows: number;
  overallStatus: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  results: TableMigrationResult[];
}

export const MIGRATABLE_TABLES: { table: string; pk: string }[] = [
  { table: "users", pk: "id" },
  { table: "roles", pk: "id" },
  { table: "permissions", pk: "id" },
  { table: "system_settings", pk: "key" },
  { table: "media_assets", pk: "id" },
  { table: "public_cms_sections", pk: "section_key" },
  { table: "items", pk: "id" },
  { table: "inventory", pk: "id" },
  { table: "stock_movements", pk: "id" },
  { table: "projects", pk: "id" },
  { table: "spks", pk: "id" },
  { table: "ntps", pk: "id" },
  { table: "boms", pk: "id" },
  { table: "bom_templates", pk: "id" },
  { table: "bom_template_items", pk: "id" },
  { table: "bop_versions", pk: "id" },
  { table: "bill_of_processes", pk: "id" },
  { table: "product_node_lifecycle", pk: "id" },
  { table: "production_manpower", pk: "id" },
  { table: "project_stations", pk: "id" },
  { table: "production_manpower_assignments", pk: "id" },
  { table: "production_lots", pk: "id" },
  { table: "lot_routing_executions", pk: "id" },
  { table: "task_travel_tags", pk: "id" },
  { table: "notice_to_down_processes", pk: "id" },
  { table: "ndps", pk: "id" },
  { table: "finish_good_records", pk: "id" },
  { table: "wip_movements", pk: "id" },
  { table: "work_orders", pk: "id" },
  { table: "work_order_items", pk: "id" },
  { table: "work_order_tickets", pk: "id" },
  { table: "quotations", pk: "id" },
  { table: "quotation_items", pk: "id" },
  { table: "crm_leads", pk: "id" },
  { table: "shop_customers", pk: "id" },
  { table: "shop_orders", pk: "id" },
  { table: "shop_order_items", pk: "id" },
  { table: "purchase_requests", pk: "id" },
  { table: "pr_items", pk: "id" },
  { table: "procurement_plans", pk: "id" },
  { table: "procurement_plan_waves", pk: "id" },
  { table: "procurement_plan_items", pk: "id" },
  { table: "purchase_orders", pk: "id" },
  { table: "grns", pk: "id" },
  { table: "grn_items", pk: "id" },
  { table: "delivery_notes", pk: "id" },
  { table: "delivery_items", pk: "id" },
  { table: "delivery_receipts", pk: "id" },
  { table: "delivery_receipt_items", pk: "id" },
  { table: "commercial_invoices", pk: "id" },
  { table: "chart_of_accounts", pk: "id" },
  { table: "accounting_periods", pk: "id" },
  { table: "closing_required_items", pk: "id" },
  { table: "closing_snapshots", pk: "id" },
  { table: "finance_transactions", pk: "id" },
  { table: "journal_entries", pk: "id" },
  { table: "journal_entry_lines", pk: "id" },
  { table: "finance_payroll", pk: "id" },
  { table: "payroll_requisitions", pk: "id" },
  { table: "hr_jobs", pk: "id" },
  { table: "hr_applications", pk: "id" },
  { table: "hr_kpis", pk: "id" },
  { table: "hr_leaves", pk: "id" },
  { table: "hr_salaries", pk: "id" },
  { table: "hr_payslips", pk: "id" },
  { table: "hr_attendances", pk: "id" },
  { table: "forum_threads", pk: "id" },
  { table: "forum_messages", pk: "id" },
  { table: "audit_logs", pk: "id" },
  { table: "approval_logs", pk: "id" },
  { table: "eco_logs", pk: "id" },
  { table: "workflow_configs", pk: "id" },
  { table: "workspace_documents", pk: "id" },
  { table: "project_tasks", pk: "id" },
  { table: "customers", pk: "id" },
  { table: "suppliers", pk: "id" },
  { table: "item_supplier_prices", pk: "id" },
  { table: "item_price_history", pk: "id" },
  { table: "work_centers", pk: "id" },
  { table: "production_stations", pk: "id" },
  { table: "bank_accounts", pk: "id" },
  { table: "inventory_labels", pk: "id" },
  { table: "inventory_reservations", pk: "id" },
];

let isMigrationRunning = false;
let lastMigrationSummary: FullMigrationSummary | null = null;

function computeChecksum(rows: any[]): string {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(rows));
  return hash.digest("hex");
}

function tableExists(tableName: string): boolean {
  const row = sqliteDb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    )
    .get(tableName);
  return !!row;
}

export function getSQLiteTableStats() {
  return MIGRATABLE_TABLES.map(({ table }) => {
    if (!tableExists(table)) {
      return { table, exists: false, rowCount: 0 };
    }
    try {
      const res = sqliteDb
        .prepare(`SELECT COUNT(*) as cnt FROM ${table}`)
        .get() as { cnt: number };
      return { table, exists: true, rowCount: res.cnt };
    } catch {
      return { table, exists: false, rowCount: 0 };
    }
  });
}

/**
 * Executes a full, SHA-256 verified batch sync of all ERP SQLite tables
 * to Supabase Cloud PostgreSQL (`public.erp_sync_records`).
 */
export async function runFullMigration(): Promise<FullMigrationSummary> {
  if (isMigrationRunning) {
    throw new Error("A migration batch is already in progress.");
  }

  isMigrationRunning = true;
  const batchId = `SUPA_BATCH_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const results: TableMigrationResult[] = [];
  let totalRows = 0;

  try {
    for (const { table, pk } of MIGRATABLE_TABLES) {
      const res = await migrateSingleTable(table, pk, batchId);
      results.push(res);
      totalRows += res.migratedCount;
    }

    const failedCount = results.filter((r) => r.status === "FAILED").length;
    const overallStatus =
      failedCount === 0
        ? "SUCCESS"
        : failedCount < results.length
          ? "PARTIAL_SUCCESS"
          : "FAILED";

    const completedAt = new Date().toISOString();
    const summary: FullMigrationSummary = {
      batchId,
      startedAt,
      completedAt,
      totalTables: results.length,
      totalRows,
      overallStatus,
      results,
    };

    await hybridDb.write("migration_batches", batchId, summary);

    if (overallStatus === "SUCCESS" || overallStatus === "PARTIAL_SUCCESS") {
      setDbMode("DUAL_SYNC");
    }

    lastMigrationSummary = summary;
    return summary;
  } finally {
    isMigrationRunning = false;
  }
}

export async function migrateSingleTable(
  tableName: string,
  pkColumn = "id",
  batchId?: string,
): Promise<TableMigrationResult> {
  const startTimer = Date.now();
  const effectiveBatchId = batchId || `SINGLE_${Date.now()}`;

  if (!tableExists(tableName)) {
    return {
      tableName,
      rowCount: 0,
      migratedCount: 0,
      checksum: "EMPTY_OR_NOT_EXISTS",
      status: "SKIPPED",
      durationMs: Date.now() - startTimer,
    };
  }

  try {
    const rows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all() as any[];
    const rowCount = rows.length;
    const checksum = computeChecksum(rows);

    if (rowCount === 0) {
      return {
        tableName,
        rowCount: 0,
        migratedCount: 0,
        checksum,
        status: "SUCCESS",
        durationMs: Date.now() - startTimer,
      };
    }

    const items = rows.map((r, index) => {
      const rawId = r[pkColumn] ?? r.id ?? r.key ?? `${tableName}_${index + 1}`;
      const docId = String(rawId).replace(/\//g, "_");
      const data: Record<string, any> = { ...r };

      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string" && (v.startsWith("{") || v.startsWith("["))) {
          try {
            data[k] = JSON.parse(v);
          } catch {
            // keep as string if not valid JSON
          }
        }
      }

      return { id: docId, data };
    });

    // High-throughput batch upsert to Supabase PostgreSQL (`public.erp_sync_records`)
    const migratedCount = await hybridDb.batchWrite(tableName, items, checksum);

    // Record table migration audit log
    const logId = `${effectiveBatchId}_${tableName}`;
    await hybridDb.write("migration_logs", logId, {
      batch_id: effectiveBatchId,
      table_name: tableName,
      started_at: new Date(startTimer).toISOString(),
      completed_at: new Date().toISOString(),
      row_count: rowCount,
      migrated_count: migratedCount,
      checksum,
      status: "SUCCESS",
    });

    return {
      tableName,
      rowCount,
      migratedCount,
      checksum,
      status: "SUCCESS",
      durationMs: Date.now() - startTimer,
    };
  } catch (err: any) {
    console.error(`[MigrationEngine] Error syncing table ${tableName}:`, err);
    return {
      tableName,
      rowCount: 0,
      migratedCount: 0,
      checksum: "ERROR",
      status: "FAILED",
      durationMs: Date.now() - startTimer,
      error: err?.message || String(err),
    };
  }
}

export function getMigrationState() {
  return {
    isMigrationRunning,
    lastSummary: lastMigrationSummary,
  };
}
