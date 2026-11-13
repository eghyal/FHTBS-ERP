import { Router } from "express";
import db from "../db/database.ts";
import { requireRole, getActor, type AuthenticatedRequest } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import {
  getPgDb,
  pgQuery,
  isDirectPgConnected,
} from "../db/postgresClient.ts";
import { supabaseServerClient } from "../db/postgresBridge.ts";
import crypto from "crypto";

export const integrityRouter = Router();

export interface StockReconciliationItem {
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  physical_qty: number;
  free_stock: number;
  allocated_stock: number;
  total_inventory_qty: number;
  calculated_movement_qty: number;
  variance: number;
  status: "BALANCED" | "DISCREPANCY";
}

export interface GlJournalAuditItem {
  id: string;
  entry_number: string;
  entry_date: string;
  reference_type: string;
  description: string;
  total_debit: number;
  total_credit: number;
  line_debit_sum: number;
  line_credit_sum: number;
  variance: number;
  is_balanced: boolean;
}

export function performStockAndGlIntegrityCheck() {
  // 1. Stock Movements vs Inventory Table Reconciliation
  const inventoryRows = db.prepare(`
    SELECT 
      i.id as item_id,
      i.item_code,
      i.name as item_name,
      i.uom,
      COALESCE(inv.physical_qty, COALESCE(inv.free_stock, 0) + COALESCE(inv.allocated_stock, 0)) as physical_qty,
      COALESCE(inv.free_stock, 0) as free_stock,
      COALESCE(inv.allocated_stock, 0) as allocated_stock
    FROM items i
    LEFT JOIN inventory inv ON i.id = inv.item_id
    WHERE i.deleted_at IS NULL
    ORDER BY i.name ASC
  `).all() as any[];

  // Calculate sum of movements per item
  const movementsSummary = db.prepare(`
    SELECT 
      item_id,
      SUM(
        CASE 
          WHEN type IN ('GRN', 'GRN_ALLOCATION', 'RETURN') THEN qty
          WHEN type = 'ADJUSTMENT' THEN qty
          WHEN type = 'CONSUMPTION' THEN -ABS(qty)
          ELSE 0
        END
      ) as net_movement_qty
    FROM stock_movements
    GROUP BY item_id
  `).all() as any[];

  const movementMap = new Map<string, number>();
  movementsSummary.forEach((m) => {
    movementMap.set(m.item_id, Number(m.net_movement_qty || 0));
  });

  const stockItems: StockReconciliationItem[] = [];
  let totalStockDiscrepancies = 0;
  let totalStockPhysicalSum = 0;
  let totalStockMovementSum = 0;

  for (const inv of inventoryRows) {
    const totalInv = Number(inv.physical_qty || 0);
    // If there are movement records, expected stock is movement sum; if 0 movements recorded yet, compare to free_stock
    const calcQty = movementMap.has(inv.item_id)
      ? movementMap.get(inv.item_id)!
      : Number(inv.free_stock || 0);

    const variance = Math.round((totalInv - calcQty) * 1000) / 1000;
    const isBalanced = Math.abs(variance) < 0.001;

    if (!isBalanced) {
      totalStockDiscrepancies++;
    }

    totalStockPhysicalSum += totalInv;
    totalStockMovementSum += calcQty;

    stockItems.push({
      item_id: inv.item_id,
      item_code: inv.item_code,
      item_name: inv.item_name,
      uom: inv.uom || "Unit",
      physical_qty: Number(inv.physical_qty || 0),
      free_stock: Number(inv.free_stock || 0),
      allocated_stock: Number(inv.allocated_stock || 0),
      total_inventory_qty: totalInv,
      calculated_movement_qty: calcQty,
      variance,
      status: isBalanced ? "BALANCED" : "DISCREPANCY",
    });
  }

  // 2. General Ledger Debit = Kredit Balance Audit
  const glEntries = db.prepare(`
    SELECT 
      je.id,
      je.entry_number,
      je.entry_date,
      je.reference_type,
      je.description,
      je.total_debit,
      je.total_credit,
      COALESCE(SUM(jel.debit), 0) as line_debit_sum,
      COALESCE(SUM(jel.credit), 0) as line_credit_sum
    FROM journal_entries je
    LEFT JOIN journal_entry_lines jel ON je.id = jel.entry_id
    GROUP BY je.id
    ORDER BY je.entry_date DESC
    LIMIT 200
  `).all() as any[];

  let totalGlDebit = 0;
  let totalGlCredit = 0;
  let totalUnbalancedJournals = 0;
  const glAuditList: GlJournalAuditItem[] = [];

  for (const je of glEntries) {
    const debit = Math.round(Number(je.line_debit_sum || je.total_debit || 0) * 100) / 100;
    const credit = Math.round(Number(je.line_credit_sum || je.total_credit || 0) * 100) / 100;
    const diff = Math.round(Math.abs(debit - credit) * 100) / 100;
    const isBalanced = diff <= 0.01;

    if (!isBalanced) {
      totalUnbalancedJournals++;
    }

    totalGlDebit += debit;
    totalGlCredit += credit;

    glAuditList.push({
      id: je.id,
      entry_number: je.entry_number,
      entry_date: je.entry_date,
      reference_type: je.reference_type,
      description: je.description,
      total_debit: debit,
      total_credit: credit,
      line_debit_sum: debit,
      line_credit_sum: credit,
      variance: diff,
      is_balanced: isBalanced,
    });
  }

  const overallGlVariance = Math.round(Math.abs(totalGlDebit - totalGlCredit) * 100) / 100;
  const isGlGloballyBalanced = overallGlVariance <= 0.05 && totalUnbalancedJournals === 0;

  return {
    timestamp: new Date().toISOString(),
    stockIntegrity: {
      isHealthy: totalStockDiscrepancies === 0,
      totalItemsAudited: inventoryRows.length,
      discrepancyCount: totalStockDiscrepancies,
      totalPhysicalQtySum: Math.round(totalStockPhysicalSum * 100) / 100,
      totalCalculatedQtySum: Math.round(totalStockMovementSum * 100) / 100,
      discrepancies: stockItems.filter((i) => i.status === "DISCREPANCY"),
      sampleAuditedItems: stockItems.slice(0, 50),
    },
    generalLedgerIntegrity: {
      isHealthy: isGlGloballyBalanced,
      totalDebit: totalGlDebit,
      totalCredit: totalGlCredit,
      variance: overallGlVariance,
      totalEntriesAudited: glEntries.length,
      unbalancedCount: totalUnbalancedJournals,
      unbalancedJournals: glAuditList.filter((j) => !j.is_balanced),
      recentJournals: glAuditList.slice(0, 30),
    },
  };
}

/**
 * GET /api/integrity/health-check
 * Evaluates real-time warehouse stock balance & double-entry General Ledger equality
 */
integrityRouter.get("/api/integrity/health-check", requireRole(["FC", "ADMIN", "SUPERADMIN", "WAREHOUSE", "FINANCE"]), (_req, res) => {
  try {
    const report = performStockAndGlIntegrityCheck();
    res.json({
      success: true,
      report,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to perform integrity check" });
  }
});

/**
 * POST /api/integrity/auto-repair
 * FC-Only automated repair for stock discrepancies & unbalanced journal lines
 */
integrityRouter.post("/api/integrity/auto-repair", requireRole(["FC", "SUPERADMIN"]), (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    const report = performStockAndGlIntegrityCheck();
    let repairedStockCount = 0;
    let repairedGlCount = 0;
    const nowIso = new Date().toISOString();

    db.transaction(() => {
      // 1. Repair stock discrepancies: align inventory table with canonical stock_movements
      for (const item of report.stockIntegrity.discrepancies) {
        // Correct inventory.physical_qty and free_stock
        db.prepare(`
          INSERT INTO inventory (item_id, physical_qty, free_stock, allocated_stock, available_qty)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(item_id) DO UPDATE SET
            physical_qty = excluded.physical_qty,
            free_stock = excluded.free_stock,
            available_qty = excluded.available_qty
        `).run(
          item.item_id,
          item.calculated_movement_qty,
          item.calculated_movement_qty - item.allocated_stock,
          item.allocated_stock,
          item.calculated_movement_qty - item.allocated_stock
        );

        // Record a corrective movement trail
        const adjId = "STK-REPAIR-" + Date.now() + "-" + crypto.randomBytes(2).toString("hex").toUpperCase();
        db.prepare(`
          INSERT INTO stock_movements (
            id, item_id, type, qty, reference_id, recorded_by, created_at
          ) VALUES (?, ?, 'ADJUSTMENT', ?, 'AUTO_REPAIR_HEALTH_CHECK', ?, ?)
        `).run(
          adjId,
          item.item_id,
          -item.variance,
          actor,
          nowIso
        );

        repairedStockCount++;
      }

      // 2. Repair unbalanced journal entries: balance lines to prevent accounting drift
      for (const gl of report.generalLedgerIntegrity.unbalancedJournals) {
        const diff = Math.round((gl.line_debit_sum - gl.line_credit_sum) * 100) / 100;
        if (Math.abs(diff) > 0.01) {
          const lineId = "JEL-REPAIR-" + Date.now() + "-" + crypto.randomBytes(2).toString("hex").toUpperCase();
          if (diff > 0) {
            // Debit exceeds credit, post credit line to suspense account 9999
            db.prepare(`
              INSERT INTO journal_entry_lines (id, entry_id, account_code, account_name, debit, credit, memo)
              VALUES (?, ?, '9999', 'Selisih Rekonsiliasi Otomatis (Suspense)', 0, ?, 'Auto-repair double entry balancing')
            `).run(lineId, gl.id, diff);
          } else {
            // Credit exceeds debit, post debit line
            db.prepare(`
              INSERT INTO journal_entry_lines (id, entry_id, account_code, account_name, debit, credit, memo)
              VALUES (?, ?, '9999', 'Selisih Rekonsiliasi Otomatis (Suspense)', ?, 0, 'Auto-repair double entry balancing')
            `).run(lineId, gl.id, Math.abs(diff));
          }

          // Update header totals
          const maxVal = Math.max(gl.line_debit_sum, gl.line_credit_sum);
          db.prepare(`
            UPDATE journal_entries SET total_debit = ?, total_credit = ? WHERE id = ?
          `).run(maxVal, maxVal, gl.id);

          repairedGlCount++;
        }
      }
    })();

    logAudit(
      actor,
      "INTEGRITY_AUTO_REPAIR",
      "SYSTEM",
      "ALL",
      `Executed Automated Integrity Repair: ${repairedStockCount} stock items corrected, ${repairedGlCount} GL entries balanced.`
    );

    const updatedReport = performStockAndGlIntegrityCheck();

    res.json({
      success: true,
      message: `Berhasil menjalankan perbaikan integritas: ${repairedStockCount} saldo gudang diselaraskan, ${repairedGlCount} entri jurnal diseimbangkan.`,
      repairedStockCount,
      repairedGlCount,
      updatedReport,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to execute auto-repair" });
  }
});

// ============================================================================
// LAYER-2 CLOUD BACKUP & POINT-IN-TIME RECOVERY (PITR) API
// ============================================================================

export const BACKUP_SETUP_SQL = `
CREATE TABLE IF NOT EXISTS public.erp_daily_backups (
  backup_id TEXT PRIMARY KEY,
  dump_type TEXT NOT NULL DEFAULT 'DAILY_SNAPSHOT',
  total_tables INTEGER NOT NULL DEFAULT 0,
  total_records INTEGER NOT NULL DEFAULT 0,
  table_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_daily_backups_created
  ON public.erp_daily_backups (created_at DESC);

ALTER TABLE public.erp_daily_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Strict service_role on erp_daily_backups" ON public.erp_daily_backups;
CREATE POLICY "Strict service_role on erp_daily_backups"
  ON public.erp_daily_backups
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
`;

export async function ensureBackupTableExists(): Promise<boolean> {
  try {
    await getPgDb();
    if (isDirectPgConnected()) {
      await pgQuery(BACKUP_SETUP_SQL);
      return true;
    }
    return false;
  } catch (e) {
    console.warn("[BackupService] ensureBackupTableExists notice:", e);
    return false;
  }
}

/**
 * Creates an exportable snapshot of the local database tables
 */
export function generateLocalDatabaseDump() {
  const tableRows = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'
  `).all() as { name: string }[];

  const dump: Record<string, any[]> = {};
  const tableCounts: Record<string, number> = {};
  let totalRecords = 0;

  for (const t of tableRows) {
    try {
      const rows = db.prepare(`SELECT * FROM "${t.name}"`).all() as any[];
      dump[t.name] = rows;
      tableCounts[t.name] = rows.length;
      totalRecords += rows.length;
    } catch (e) {
      dump[t.name] = [];
      tableCounts[t.name] = 0;
    }
  }

  const jsonStr = JSON.stringify(dump);
  const hash = crypto.createHash("sha256").update(jsonStr).digest("hex");

  return {
    dump,
    tableCounts,
    totalTables: tableRows.length,
    totalRecords,
    sizeBytes: Buffer.byteLength(jsonStr, "utf8"),
    checksum: hash,
  };
}

/**
 * GET /api/backup/snapshots
 * Returns list of historical daily snapshots in Supabase PostgreSQL public.erp_daily_backups
 */
integrityRouter.get("/api/backup/snapshots", requireRole(["FC", "ADMIN", "SUPERADMIN"]), async (_req, res) => {
  try {
    await ensureBackupTableExists();
    let snapshots: any[] = [];

    if (isDirectPgConnected()) {
      const q = await pgQuery<{
        backup_id: string;
        dump_type: string;
        total_tables: number;
        total_records: number;
        table_counts: any;
        checksum: string;
        size_bytes: number;
        created_at: string;
      }>(`
        SELECT backup_id, dump_type, total_tables, total_records, table_counts, checksum, size_bytes, created_at
        FROM public.erp_daily_backups
        ORDER BY created_at DESC
        LIMIT 30
      `);
      snapshots = q.rows || [];
    } else {
      const { data, error } = await supabaseServerClient
        .from("erp_daily_backups")
        .select("backup_id, dump_type, total_tables, total_records, table_counts, checksum, size_bytes, created_at")
        .order("created_at", { ascending: false })
        .limit(30);

      if (!error && data) {
        snapshots = data;
      }
    }

    res.json({
      success: true,
      pitrInfo: {
        provider: "Supabase PostgreSQL",
        architecture: "Continuous WAL Archiving + Point-in-Time Recovery",
        recommendedRecoveryWindow: "7 Days (Pro) / On-Demand WAL replay",
        secondLayerDumpTable: "public.erp_daily_backups",
      },
      snapshots,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to fetch backup snapshots" });
  }
});

/**
 * POST /api/backup/trigger-dump
 * Creates a complete database snapshot and stores it in Supabase public.erp_daily_backups
 */
integrityRouter.post("/api/backup/trigger-dump", requireRole(["FC", "SUPERADMIN"]), async (req: AuthenticatedRequest, res) => {
  try {
    const actor = getActor(req);
    await ensureBackupTableExists();

    const dumpData = generateLocalDatabaseDump();
    const backupId = "DUMP-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomBytes(2).toString("hex").toUpperCase();
    const nowIso = new Date().toISOString();

    let uploaded = false;
    if (isDirectPgConnected()) {
      await pgQuery(`
        INSERT INTO public.erp_daily_backups (
          backup_id, dump_type, total_tables, total_records, table_counts, payload, checksum, size_bytes, created_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
      `, [
        backupId,
        "MANUAL_TRIGGER",
        dumpData.totalTables,
        dumpData.totalRecords,
        JSON.stringify(dumpData.tableCounts),
        JSON.stringify(dumpData.dump),
        dumpData.checksum,
        dumpData.sizeBytes,
        nowIso,
      ]);
      uploaded = true;
    } else {
      const { error } = await supabaseServerClient
        .from("erp_daily_backups")
        .insert({
          backup_id: backupId,
          dump_type: "MANUAL_TRIGGER",
          total_tables: dumpData.totalTables,
          total_records: dumpData.totalRecords,
          table_counts: dumpData.tableCounts,
          payload: dumpData.dump,
          checksum: dumpData.checksum,
          size_bytes: dumpData.sizeBytes,
          created_at: nowIso,
        });

      if (error) {
        throw new Error(error.message);
      }
      uploaded = true;
    }

    logAudit(
      actor,
      "TRIGGER_LAYER2_BACKUP",
      "DATABASE",
      backupId,
      `Generated layer-2 database backup snapshot: ${dumpData.totalRecords} records across ${dumpData.totalTables} tables (${(dumpData.sizeBytes / 1024).toFixed(1)} KB)`
    );

    res.json({
      success: true,
      backupId,
      totalTables: dumpData.totalTables,
      totalRecords: dumpData.totalRecords,
      sizeBytes: dumpData.sizeBytes,
      checksum: dumpData.checksum,
      createdAt: nowIso,
      message: `Snapshot cadangan layer-2 (${dumpData.totalRecords} baris, ${(dumpData.sizeBytes / 1024).toFixed(1)} KB) berhasil disimpan ke Supabase PostgreSQL!`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to trigger database dump" });
  }
});

/**
 * GET /api/backup/download/:id
 * Streams or sends raw JSON / SQL dump for offline retention
 */
integrityRouter.get("/api/backup/download/:id", requireRole(["FC", "SUPERADMIN"]), async (req, res) => {
  try {
    const backupId = req.params.id;
    let payload: any = null;

    if (isDirectPgConnected()) {
      const q = await pgQuery<{ payload: any }>(
        `SELECT payload FROM public.erp_daily_backups WHERE backup_id = $1`,
        [backupId]
      );
      if (q.rows && q.rows[0]) {
        payload = q.rows[0].payload;
      }
    } else {
      const { data, error } = await supabaseServerClient
        .from("erp_daily_backups")
        .select("payload")
        .eq("backup_id", backupId)
        .single();
      if (!error && data) {
        payload = data.payload;
      }
    }

    if (!payload) {
      // If not found in cloud, fall back to current live local dump
      const local = generateLocalDatabaseDump();
      payload = local.dump;
    }

    res.setHeader("Content-Disposition", `attachment; filename="fhtbs-erp-${backupId}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(payload, null, 2));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to download backup" });
  }
});
