import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { outboxService } from "../../services/outboxService.ts";
import {
  calculateFinancialBreakdown,
  type TaxScheme,
} from "../../lib/financialEngine.ts";

const PROCUREMENT_PLAN_ROLES = [
  "PURCHASING",
  "WAREHOUSE",
  "PPIC",
  "PRODUCTION",
  "ENGINEERING",
  "FC",
  "FINANCE",
  "BOD",
  "DIRECTOR",
  "ADMIN",
  "SUPERADMIN",
];

export type ManufacturingStrategyMode =
  | "BOP_STAGE_AND_WOT_LOT"
  | "BOP_PROCESS_SEQUENCE"
  | "WOT_BATCH_CADENCE";

export type ManufacturingPriorityTier =
  | "CRITICAL_MAIN"
  | "CORE_PROCESS"
  | "SUPPORTING";

function safeAddColumn(table: string, columnDef: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (_e) {
    // Column already exists
  }
}

export function ensureProcurementPlanSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS procurement_plans (
      id TEXT PRIMARY KEY,
      plan_code TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_name TEXT,
      spk_number TEXT,
      plan_name TEXT NOT NULL,
      source_type TEXT DEFAULT 'PR_QUEUE',
      strategy_mode TEXT DEFAULT 'BOP_STAGE_AND_WOT_LOT',
      total_waves INTEGER DEFAULT 1,
      lead_time_buffer_days INTEGER DEFAULT 3,
      wave_interval_days INTEGER DEFAULT 5,
      wot_lots_per_wave INTEGER DEFAULT 1,
      master_lot_size INTEGER DEFAULT 10,
      total_wot_lots INTEGER DEFAULT 1,
      shift_hours INTEGER DEFAULT 8,
      factory_factor REAL DEFAULT 85,
      total_items_count INTEGER DEFAULT 0,
      total_lot_qty REAL DEFAULT 0,
      total_estimated_budget REAL DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS procurement_plan_waves (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      wave_number INTEGER NOT NULL,
      wave_name TEXT NOT NULL,
      station_focus TEXT,
      station_id TEXT,
      station_code TEXT,
      bop_process_summary TEXT,
      wot_lot_range TEXT,
      wot_batch_ratio REAL DEFAULT 1,
      priority_focus TEXT DEFAULT 'CRITICAL_MAIN',
      critical_items_count INTEGER DEFAULT 0,
      core_items_count INTEGER DEFAULT 0,
      supporting_items_count INTEGER DEFAULT 0,
      target_order_date TEXT NOT NULL,
      target_arrival_date TEXT NOT NULL,
      production_need_date TEXT NOT NULL,
      estimated_cost REAL DEFAULT 0,
      total_qty_units REAL DEFAULT 0,
      status TEXT DEFAULT 'PLANNED',
      generated_pr_id TEXT,
      generated_pr_number TEXT,
      generated_po_id TEXT,
      generated_po_number TEXT,
      generated_pos_json TEXT,
      executed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES procurement_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS procurement_plan_items (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      wave_id TEXT NOT NULL,
      wave_number INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      item_code TEXT,
      item_name TEXT NOT NULL,
      dimension TEXT,
      spec TEXT,
      uom TEXT DEFAULT 'PCS',
      total_project_qty REAL NOT NULL,
      allocated_wave_qty REAL NOT NULL,
      unit_price REAL DEFAULT 0,
      subtotal_cost REAL DEFAULT 0,
      lead_time_days INTEGER DEFAULT 4,
      process_step_name TEXT,
      step_sequence INTEGER DEFAULT 1,
      bop_step_id TEXT,
      station_id TEXT,
      station_name TEXT,
      bom_id TEXT,
      priority_tier TEXT DEFAULT 'CORE_PROCESS',
      priority_score INTEGER DEFAULT 50,
      priority_reason TEXT,
      downstream_process_count INTEGER DEFAULT 1,
      total_process_count INTEGER DEFAULT 1,
      float_hours REAL DEFAULT 0,
      is_priority_manual_override INTEGER DEFAULT 0,
      is_critical_path INTEGER DEFAULT 0,
      process_allocation_fraction REAL DEFAULT 1,
      station_need_date TEXT,
      preferred_supplier_id TEXT,
      preferred_supplier_name TEXT,
      source_pr_id TEXT,
      source_pr_number TEXT,
      source_pr_item_id TEXT,
      generated_po_id TEXT,
      generated_po_number TEXT,
      lot_split_label TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES procurement_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (wave_id) REFERENCES procurement_plan_waves(id) ON DELETE CASCADE
    );
  `);

  // Ensure columns on existing tables for PR locking & Manufacturing Wave tracking
  safeAddColumn("pr_items", "plan_id TEXT");
  safeAddColumn("pr_items", "plan_wave_id TEXT");
  safeAddColumn("pr_items", "parent_pr_item_id TEXT");
  safeAddColumn("pr_items", "wave_number INTEGER");
  safeAddColumn("pr_items", "station_focus TEXT");
  safeAddColumn("pr_items", "lot_split_label TEXT");
  safeAddColumn("pr_items", "preferred_supplier_id TEXT");
  safeAddColumn("pr_items", "preferred_supplier_name TEXT");
  safeAddColumn("pr_items", "original_baseline_qty REAL");

  safeAddColumn("procurement_plans", "wot_lots_per_wave INTEGER DEFAULT 1");
  safeAddColumn("procurement_plans", "master_lot_size INTEGER DEFAULT 10");
  safeAddColumn("procurement_plans", "total_wot_lots INTEGER DEFAULT 1");
  safeAddColumn("procurement_plans", "shift_hours INTEGER DEFAULT 8");
  safeAddColumn("procurement_plans", "factory_factor REAL DEFAULT 85");
  safeAddColumn("procurement_plans", "master_pr_id TEXT");
  safeAddColumn("procurement_plans", "master_pr_number TEXT");
  safeAddColumn("procurement_plans", "revision_note TEXT");
  safeAddColumn("procurement_plans", "revised_by TEXT");
  safeAddColumn("procurement_plans", "revised_at TEXT");
  safeAddColumn("procurement_plans", "partial_delivery_enabled INTEGER DEFAULT 1");

  safeAddColumn("purchase_requests", "title TEXT");
  safeAddColumn("purchase_requests", "department TEXT");
  safeAddColumn("purchase_requests", "requester_name TEXT");
  safeAddColumn("purchase_requests", "requested_by TEXT");
  safeAddColumn("purchase_requests", "created_by TEXT");
  safeAddColumn("purchase_requests", "notes TEXT");

  safeAddColumn("procurement_plan_waves", "generated_pos_json TEXT");
  safeAddColumn("procurement_plan_waves", "station_id TEXT");
  safeAddColumn("procurement_plan_waves", "station_code TEXT");
  safeAddColumn("procurement_plan_waves", "bop_process_summary TEXT");
  safeAddColumn("procurement_plan_waves", "wot_lot_range TEXT");
  safeAddColumn("procurement_plan_waves", "wot_batch_ratio REAL DEFAULT 1");
  safeAddColumn("procurement_plan_waves", "target_fg_delivery_date TEXT");
  safeAddColumn("procurement_plan_waves", "target_fg_lot_qty REAL DEFAULT 0");
  safeAddColumn("procurement_plan_waves", "fg_delivery_status TEXT DEFAULT 'SCHEDULED'");
  safeAddColumn("procurement_plan_waves", "fgr_id TEXT");
  safeAddColumn("procurement_plan_waves", "fgr_number TEXT");
  safeAddColumn("procurement_plan_waves", "linked_dn_id TEXT");
  safeAddColumn("procurement_plan_waves", "linked_dn_number TEXT");
  safeAddColumn("procurement_plan_waves", "linked_ci_id TEXT");
  safeAddColumn("procurement_plan_waves", "linked_ci_number TEXT");

  safeAddColumn("delivery_notes", "is_partial INTEGER DEFAULT 0");
  safeAddColumn("delivery_notes", "delivery_type TEXT DEFAULT 'FULL'");
  safeAddColumn("delivery_notes", "wave_id TEXT");
  safeAddColumn("delivery_notes", "wave_number INTEGER");
  safeAddColumn("delivery_notes", "wot_lot_range TEXT");
  safeAddColumn("delivery_notes", "fgr_id TEXT");

  safeAddColumn("commercial_invoices", "billing_mode TEXT DEFAULT 'SINGLE_DO'");
  safeAddColumn("commercial_invoices", "consolidated_dn_ids_json TEXT");
  safeAddColumn("commercial_invoices", "consolidated_dn_numbers_json TEXT");
  safeAddColumn("commercial_invoices", "wave_ids_json TEXT");
  safeAddColumn(
    "procurement_plan_waves",
    "priority_focus TEXT DEFAULT 'CRITICAL_MAIN'",
  );
  safeAddColumn(
    "procurement_plan_waves",
    "critical_items_count INTEGER DEFAULT 0",
  );
  safeAddColumn("procurement_plan_waves", "core_items_count INTEGER DEFAULT 0");
  safeAddColumn(
    "procurement_plan_waves",
    "supporting_items_count INTEGER DEFAULT 0",
  );

  safeAddColumn("procurement_plan_items", "generated_po_id TEXT");
  safeAddColumn("procurement_plan_items", "generated_po_number TEXT");
  safeAddColumn("procurement_plan_items", "bop_step_id TEXT");
  safeAddColumn("procurement_plan_items", "station_id TEXT");
  safeAddColumn("procurement_plan_items", "station_name TEXT");
  safeAddColumn("procurement_plan_items", "bom_id TEXT");
  safeAddColumn(
    "procurement_plan_items",
    "priority_tier TEXT DEFAULT 'CORE_PROCESS'",
  );
  safeAddColumn(
    "procurement_plan_items",
    "priority_score INTEGER DEFAULT 50",
  );
  safeAddColumn("procurement_plan_items", "priority_reason TEXT");
  safeAddColumn(
    "procurement_plan_items",
    "downstream_process_count INTEGER DEFAULT 1",
  );
  safeAddColumn(
    "procurement_plan_items",
    "total_process_count INTEGER DEFAULT 1",
  );
  safeAddColumn("procurement_plan_items", "float_hours REAL DEFAULT 0");
  safeAddColumn(
    "procurement_plan_items",
    "is_priority_manual_override INTEGER DEFAULT 0",
  );
  safeAddColumn("procurement_plan_items", "is_critical_path INTEGER DEFAULT 0");
  safeAddColumn(
    "procurement_plan_items",
    "process_allocation_fraction REAL DEFAULT 1",
  );
  safeAddColumn("procurement_plan_items", "station_need_date TEXT");

  // Automatically reset any legacy Warehouse/Finance Sweetspot plans to 0
  // and unlock their PR items back to the active queue for the Manufacturing Wave engine
  try {
    const legacyPlans = db
      .prepare(
        `SELECT id FROM procurement_plans
         WHERE strategy_mode IN ('HYBRID_SWEETSPOT', 'LOT_SPLITTING', 'STATION_SEQUENCE')
           AND status != 'ARCHIVED'`,
      )
      .all() as { id: string }[];

    if (legacyPlans.length > 0) {
      db.transaction(() => {
        for (const lp of legacyPlans) {
          rollbackPrItemsForPlanOrWave({ planId: lp.id });
          db.prepare(
            "UPDATE procurement_plans SET status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(lp.id);
        }
      })();
    }
  } catch (_err) {
    // Ignore during early table bootstrap
  }
}

function addDaysIso(baseDateStr: string, days: number): string {
  const base = baseDateStr ? new Date(`${baseDateStr.slice(0, 10)}T00:00:00`) : new Date();
  if (isNaN(base.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + Math.round(days));
    return fallback.toISOString().split("T")[0];
  }
  const d = new Date(base);
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().split("T")[0];
}

function daysBetweenIso(startIso: string, endIso: string): number {
  const s = new Date(`${String(startIso).slice(0, 10)}T00:00:00`);
  const e = new Date(`${String(endIso).slice(0, 10)}T00:00:00`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 14;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeStrategyMode(raw?: string): ManufacturingStrategyMode {
  if (raw === "BOP_PROCESS_SEQUENCE" || raw === "STATION_SEQUENCE") {
    return "BOP_PROCESS_SEQUENCE";
  }
  if (raw === "WOT_BATCH_CADENCE" || raw === "LOT_SPLITTING") {
    return "WOT_BATCH_CADENCE";
  }
  return "BOP_STAGE_AND_WOT_LOT";
}

function normalizePriorityTier(raw?: string): ManufacturingPriorityTier {
  if (raw === "CRITICAL_MAIN") return "CRITICAL_MAIN";
  if (raw === "SUPPORTING") return "SUPPORTING";
  return "CORE_PROCESS";
}

function priorityRank(tier: ManufacturingPriorityTier): number {
  if (tier === "CRITICAL_MAIN") return 1;
  if (tier === "CORE_PROCESS") return 2;
  return 3;
}

function generateNextPlanCode(): string {
  const year = new Date().getFullYear();
  const countRow = db
    .prepare("SELECT COUNT(*) as c FROM procurement_plans")
    .get() as { c: number };
  const seq = (countRow?.c || 0) + 1;
  return `PPLAN-${year}-${String(seq).padStart(3, "0")}`;
}

export function reconcileWaveAndPlanLifecycleByWaveId(waveId: string) {
  if (!waveId) return;
  const wave = db
    .prepare("SELECT * FROM procurement_plan_waves WHERE id = ?")
    .get(waveId) as any;
  if (!wave) return;

  const waveItems = db
    .prepare("SELECT * FROM procurement_plan_items WHERE wave_id = ?")
    .all(waveId) as any[];

  // Sync any PO generated via Design Requests (PR -> PO) back onto procurement_plan_items
  for (const wItem of waveItems) {
    if (!wItem.generated_po_id && wItem.source_pr_item_id) {
      const prItemRow = db
        .prepare(
          `SELECT pri.po_id, po.po_number, po.status, po.archived, po.archived_at
           FROM pr_items pri
           LEFT JOIN purchase_orders po ON pri.po_id = po.id
           WHERE pri.id = ? AND pri.po_id IS NOT NULL`,
        )
        .get(wItem.source_pr_item_id) as any;
      if (
        prItemRow?.po_id &&
        prItemRow.status !== "CANCELLED" &&
        Number(prItemRow.archived || 0) === 0 &&
        !prItemRow.archived_at
      ) {
        db.prepare(
          `UPDATE procurement_plan_items
           SET generated_po_id = ?,
               generated_po_number = ?
           WHERE id = ?`,
        ).run(prItemRow.po_id, prItemRow.po_number || null, wItem.id);
        wItem.generated_po_id = prItemRow.po_id;
        wItem.generated_po_number = prItemRow.po_number || null;
      }
    }

    if (wItem.generated_po_id) {
      const poRow = db
        .prepare(
          "SELECT id, po_number, status, archived, archived_at FROM purchase_orders WHERE id = ?",
        )
        .get(wItem.generated_po_id) as any;
      if (
        !poRow ||
        poRow.status === "CANCELLED" ||
        Number(poRow.archived || 0) === 1 ||
        Boolean(poRow.archived_at)
      ) {
        db.prepare(
          `UPDATE procurement_plan_items
           SET generated_po_id = NULL,
               generated_po_number = NULL
           WHERE id = ?`,
        ).run(wItem.id);
        wItem.generated_po_id = null;
        wItem.generated_po_number = null;
      }
    }
  }

  const activePoIds = Array.from(
    new Set(waveItems.map((it) => it.generated_po_id).filter(Boolean)),
  ) as string[];

  if (activePoIds.length === 0 && wave.generated_po_id) {
    const directPo = db
      .prepare(
        "SELECT id, status, archived, archived_at FROM purchase_orders WHERE id = ?",
      )
      .get(wave.generated_po_id) as any;
    if (
      directPo &&
      directPo.status !== "CANCELLED" &&
      Number(directPo.archived || 0) === 0 &&
      !directPo.archived_at
    ) {
      activePoIds.push(directPo.id);
    }
  }

  // Check active PRs linked to this wave (Design Request integration)
  const linkedPrIds = Array.from(
    new Set([
      ...(wave.generated_pr_id ? [wave.generated_pr_id] : []),
      ...waveItems.map((it) => it.source_pr_id).filter(Boolean),
    ]),
  ) as string[];

  let activePrRows: any[] = [];
  if (linkedPrIds.length > 0) {
    const prPlaceholders = linkedPrIds.map(() => "?").join(",");
    activePrRows = db
      .prepare(
        `SELECT id, pr_number, status, revision_note, archived
         FROM purchase_requests
         WHERE id IN (${prPlaceholders})
           AND status != 'CANCELLED'
           AND COALESCE(archived, 0) = 0`,
      )
      .all(...linkedPrIds) as any[];
  }

  if (activePoIds.length === 0) {
    if (activePrRows.length > 0 && wave.generated_pr_id) {
      const anyRevision = activePrRows.some(
        (pr) => String(pr.status || "").toUpperCase() === "REVISION",
      );
      const anyAuthorized = activePrRows.some((pr) =>
        ["AUTHORIZED", "APPROVED", "ORDERED", "PARTIAL_ORDERED"].includes(
          String(pr.status || "").toUpperCase(),
        ),
      );
      const nextPrWaveStatus = anyRevision
        ? "REVISION"
        : anyAuthorized
          ? "PR_AUTHORIZED"
          : "PR_DRAFTED";
      const prNums = activePrRows.map((p) => p.pr_number).join(", ");
      db.prepare(
        `UPDATE procurement_plan_waves
         SET status = ?,
             generated_pr_id = ?,
             generated_pr_number = ?,
             generated_po_id = NULL,
             generated_po_number = NULL,
             generated_pos_json = NULL
         WHERE id = ?`,
      ).run(
        nextPrWaveStatus,
        activePrRows[0].id,
        prNums || wave.generated_pr_number || null,
        waveId,
      );
    } else {
      db.prepare(
        `UPDATE procurement_plan_waves
         SET status = 'PLANNED',
             generated_po_id = NULL,
             generated_po_number = NULL,
             generated_pos_json = NULL,
             executed_at = NULL
         WHERE id = ?`,
      ).run(waveId);
    }
  } else {
    const placeholders = activePoIds.map(() => "?").join(",");
    const activePoRows = db
      .prepare(
        `SELECT id, po_number, supplier_id, supplier_name, status, grand_total, total_amount
         FROM purchase_orders
         WHERE id IN (${placeholders})
           AND status != 'CANCELLED'
           AND COALESCE(archived, 0) = 0
           AND archived_at IS NULL`,
      )
      .all(...activePoIds) as any[];

    if (activePoRows.length === 0) {
      db.prepare(
        `UPDATE procurement_plan_waves
         SET status = 'PLANNED',
             generated_po_id = NULL,
             generated_po_number = NULL,
             generated_pos_json = NULL,
             executed_at = NULL
         WHERE id = ?`,
      ).run(waveId);
    } else {
      const posSummary = activePoRows.map((po) => ({
        po_id: po.id,
        po_number: po.po_number,
        supplier_id: po.supplier_id || null,
        supplier_name: po.supplier_name || "Supplier",
        status: po.status,
        item_count: waveItems.filter((it) => it.generated_po_id === po.id)
          .length,
        grand_total: Number(po.grand_total || po.total_amount || 0),
      }));

      const allItemsHaveActivePo =
        waveItems.length > 0 &&
        waveItems.every((it) =>
          activePoRows.some((po) => po.id === it.generated_po_id),
        );

      const allPosReceived =
        allItemsHaveActivePo &&
        activePoRows.every((po) =>
          ["RECEIVED", "FINISHED"].includes(String(po.status).toUpperCase()),
        );
      const anyPoReceivedOrPartial = activePoRows.some((po) =>
        ["PARTIAL", "RECEIVED", "FINISHED"].includes(
          String(po.status).toUpperCase(),
        ),
      );
      const allPosIssuedOrBeyond =
        allItemsHaveActivePo &&
        activePoRows.every((po) =>
          ["ISSUED", "PARTIAL", "RECEIVED", "FINISHED"].includes(
            String(po.status).toUpperCase(),
          ),
        );

      let nextWaveStatus = "PO_DRAFTED";
      if (allPosReceived) {
        nextWaveStatus = "GRN_RECEIVED";
      } else if (anyPoReceivedOrPartial) {
        nextWaveStatus = "GRN_PARTIAL";
      } else if (allPosIssuedOrBeyond) {
        nextWaveStatus = "PO_ISSUED";
      }

      db.prepare(
        `UPDATE procurement_plan_waves
         SET status = ?,
             generated_po_id = ?,
             generated_po_number = ?,
             generated_pos_json = ?
         WHERE id = ?`,
      ).run(
        nextWaveStatus,
        posSummary[0]?.po_id || null,
        posSummary.map((p) => p.po_number).join(", ") || null,
        JSON.stringify(posSummary),
        waveId,
      );
    }
  }

  // Reconcile parent plan status
  const planWaves = db
    .prepare(
      "SELECT status FROM procurement_plan_waves WHERE plan_id = ? ORDER BY wave_number ASC",
    )
    .all(wave.plan_id) as { status: string }[];

  if (planWaves.length > 0) {
    const anyRevision = planWaves.some((w) => w.status === "REVISION");
    const allPlanned = planWaves.every((w) => w.status === "PLANNED");
    const allGrnReceived = planWaves.every((w) => w.status === "GRN_RECEIVED");
    const anyGrn = planWaves.some(
      (w) => w.status === "GRN_RECEIVED" || w.status === "GRN_PARTIAL",
    );
    const allPoIssuedOrBeyond = planWaves.every((w) =>
      ["PO_ISSUED", "GRN_PARTIAL", "GRN_RECEIVED"].includes(w.status),
    );
    const allPrAuthorizedOrBeyond = planWaves.every((w) =>
      ["PR_AUTHORIZED", "PO_DRAFTED", "PO_ISSUED", "GRN_PARTIAL", "GRN_RECEIVED"].includes(
        w.status,
      ),
    );
    const allPrPushedOrBeyond = planWaves.every((w) => w.status !== "PLANNED");

    let nextPlanStatus = "ACTIVE";
    if (anyRevision) {
      nextPlanStatus = "REVISION";
    } else if (allPlanned) {
      nextPlanStatus = "ACTIVE";
    } else if (allGrnReceived) {
      nextPlanStatus = "GRN_RECEIVED";
    } else if (anyGrn) {
      nextPlanStatus = "GRN_PARTIAL";
    } else if (allPoIssuedOrBeyond) {
      nextPlanStatus = "PO_ISSUED";
    } else if (allPrAuthorizedOrBeyond) {
      nextPlanStatus = "PR_AUTHORIZED";
    } else if (allPrPushedOrBeyond) {
      nextPlanStatus = "PR_SYNCED";
    } else {
      nextPlanStatus = "PARTIAL_EXECUTED";
    }

    const revNoteFromPr = activePrRows.find((pr) => pr.revision_note)?.revision_note || null;
    if (nextPlanStatus === "REVISION" && revNoteFromPr) {
      db.prepare(
        `UPDATE procurement_plans
         SET status = ?,
             revision_note = COALESCE(revision_note, ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status != 'ARCHIVED'`,
      ).run(nextPlanStatus, revNoteFromPr, wave.plan_id);
    } else {
      db.prepare(
        `UPDATE procurement_plans
         SET status = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status != 'ARCHIVED'`,
      ).run(nextPlanStatus, wave.plan_id);
    }
  }
}

export function reconcileWaveAndPlanLifecycleByPo(poId: string) {
  if (!poId) return;
  try {
    ensureProcurementPlanSchema();
    const waveIds = new Set<string>();

    const fromPlanItems = db
      .prepare(
        "SELECT DISTINCT wave_id FROM procurement_plan_items WHERE generated_po_id = ?",
      )
      .all(poId) as { wave_id: string }[];
    fromPlanItems.forEach((r) => {
      if (r.wave_id) waveIds.add(r.wave_id);
    });

    const fromWaves = db
      .prepare(
        "SELECT id FROM procurement_plan_waves WHERE generated_po_id = ? OR generated_pos_json LIKE ?",
      )
      .all(poId, `%${poId}%`) as { id: string }[];
    fromWaves.forEach((r) => {
      if (r.id) waveIds.add(r.id);
    });

    const fromPrItems = db
      .prepare(
        "SELECT DISTINCT plan_wave_id FROM pr_items WHERE po_id = ? AND plan_wave_id IS NOT NULL",
      )
      .all(poId) as { plan_wave_id: string }[];
    fromPrItems.forEach((r) => {
      if (r.plan_wave_id) waveIds.add(r.plan_wave_id);
    });

    for (const wId of waveIds) {
      reconcileWaveAndPlanLifecycleByWaveId(wId);
    }
  } catch (err) {
    console.warn("Failed to reconcile wave lifecycle by PO:", err);
  }
}

export function rollbackPrItemsForPlanOrWave(options: {
  planId?: string;
  poId?: string;
}) {
  const { planId, poId } = options;
  if (!planId && !poId) return;

  const affectedItems = planId
    ? (db
        .prepare(
          "SELECT * FROM pr_items WHERE plan_id = ? AND po_id IS NULL ORDER BY rowid ASC",
        )
        .all(planId) as any[])
    : (db
        .prepare("SELECT * FROM pr_items WHERE po_id = ? ORDER BY rowid ASC")
        .all(poId) as any[]);

  const touchedPrIds = new Set<string>();
  const touchedWaveIds = new Set<string>();

  if (poId) {
    const waveRefs = db
      .prepare(
        `SELECT DISTINCT wave_id FROM procurement_plan_items WHERE generated_po_id = ?
         UNION
         SELECT id as wave_id FROM procurement_plan_waves WHERE generated_po_id = ? OR generated_pos_json LIKE ?`,
      )
      .all(poId, poId, `%${poId}%`) as { wave_id: string }[];
    waveRefs.forEach((r) => {
      if (r.wave_id) touchedWaveIds.add(r.wave_id);
    });
  }

  for (const item of affectedItems) {
    touchedPrIds.add(item.pr_id);

    if (poId && !planId && item.plan_id && item.plan_wave_id) {
      const parentPlan = db
        .prepare("SELECT id, status FROM procurement_plans WHERE id = ?")
        .get(item.plan_id) as { id: string; status: string } | undefined;

      if (parentPlan && parentPlan.status !== "ARCHIVED") {
        db.prepare("UPDATE pr_items SET po_id = NULL WHERE id = ?").run(
          item.id,
        );
        db.prepare(
          `UPDATE procurement_plan_items
           SET generated_po_id = NULL,
               generated_po_number = NULL
           WHERE source_pr_item_id = ? OR (wave_id = ? AND generated_po_id = ?)`,
        ).run(item.id, item.plan_wave_id, poId);
        touchedWaveIds.add(item.plan_wave_id);
        continue;
      }
    }

    const parentId = item.parent_pr_item_id;

    if (parentId && parentId !== item.id) {
      const targetMergeRow = db
        .prepare(
          `SELECT * FROM pr_items
           WHERE (id = ? OR parent_pr_item_id = ?)
             AND id != ?
             AND po_id IS NULL
             AND plan_id IS NULL
           LIMIT 1`,
        )
        .get(parentId, parentId, item.id) as any;

      if (targetMergeRow) {
        const mergedQty = Number(
          (Number(targetMergeRow.qty || 0) + Number(item.qty || 0)).toFixed(4),
        );
        db.prepare("UPDATE pr_items SET qty = ? WHERE id = ?").run(
          mergedQty,
          targetMergeRow.id,
        );
        db.prepare("DELETE FROM pr_items WHERE id = ?").run(item.id);
        continue;
      }
    }

    db.prepare(
      `UPDATE pr_items
       SET po_id = NULL,
           plan_id = NULL,
           plan_wave_id = NULL
       WHERE id = ?`,
    ).run(item.id);
  }

  for (const wId of touchedWaveIds) {
    reconcileWaveAndPlanLifecycleByWaveId(wId);
  }

  for (const prId of touchedPrIds) {
    const unlockedRows = db
      .prepare(
        `SELECT * FROM pr_items
         WHERE pr_id = ? AND po_id IS NULL AND plan_id IS NULL
         ORDER BY CASE WHEN parent_pr_item_id IS NULL THEN 0 ELSE 1 END ASC`,
      )
      .all(prId) as any[];

    const byGroupKey = new Map<string, any>();
    for (const r of unlockedRows) {
      const groupKey = r.parent_pr_item_id || r.id;
      const existing = byGroupKey.get(groupKey);
      if (!existing) {
        byGroupKey.set(groupKey, r);
      } else {
        const nextQty = Number(
          (Number(existing.qty || 0) + Number(r.qty || 0)).toFixed(4),
        );
        db.prepare(
          "UPDATE pr_items SET qty = ?, parent_pr_item_id = NULL WHERE id = ?",
        ).run(nextQty, existing.id);
        db.prepare("DELETE FROM pr_items WHERE id = ?").run(r.id);
        existing.qty = nextQty;
      }
    }

    const orderedCount = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM pr_items WHERE pr_id = ? AND po_id IS NOT NULL",
        )
        .get(prId) as { c: number }
    ).c;

    const plannedCount = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM pr_items WHERE pr_id = ? AND po_id IS NULL AND plan_id IS NOT NULL",
        )
        .get(prId) as { c: number }
    ).c;

    db.prepare("UPDATE purchase_requests SET status = ? WHERE id = ?").run(
      orderedCount > 0 || plannedCount > 0 ? "PARTIAL_ORDERED" : "AUTHORIZED",
      prId,
    );
  }
}

export interface BopStepScheduleNode {
  step_id: string;
  step_sequence: number;
  process_name: string;
  node_type: "PROCESS" | "PRODUCT";
  station_id: string;
  station_code: string;
  station_name: string;
  station_cluster_seq: number;
  predecessor_ids: string[];
  wot_duration_hours: number;
  es_wot_hours: number;
  ef_wot_hours: number;
  float_wot_hours: number;
  is_critical_path: boolean;
  is_root_step: boolean;
  dag_depth: number;
  downstream_process_count: number;
  total_process_count: number;
  station_start_offset_days: number;
  station_start_date: string;
}

export interface ManufacturingProcessAllocation {
  bop_step_id: string;
  step_sequence: number;
  process_step_name: string;
  product_node_id?: string | null;
  product_node_name?: string | null;
  consuming_process_name?: string | null;
  station_id: string;
  station_code: string;
  station_name: string;
  station_cluster_seq: number;
  fraction: number;
  is_critical_path: boolean;
  is_root_step: boolean;
  dag_depth: number;
  float_wot_hours: number;
  downstream_process_count: number;
  total_process_count: number;
  station_start_date: string;
  station_start_offset_days: number;
}

export interface UnallocatedBomGateItem {
  bom_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  gross_bom_qty: number;
  allocated_fraction: number;
  unallocated_qty: number;
}

export interface RawCandidateItem {
  item_id: string;
  item_code: string;
  item_name: string;
  category: string;
  dimension: string;
  spec: string;
  uom: string;
  qty: number;
  bom_required_qty: number;
  gross_bom_qty?: number;
  warehouse_free_qty?: number;
  project_allocated_qty?: number;
  existing_pr_qty?: number;
  net_shortage_qty?: number;
  source_origin?: "PR_QUEUE" | "BOM_MRP";
  unit_price: number;
  lead_time_days: number;
  bom_id: string | null;
  product_node_id?: string | null;
  product_node_name?: string | null;
  consuming_process_name?: string | null;
  bop_step_id: string | null;
  process_step_name: string;
  step_sequence: number;
  station_id: string;
  station_code: string;
  station_name: string;
  station_cluster_seq: number;
  station_start_date: string;
  station_start_offset_days: number;
  is_critical_path: boolean;
  is_root_step: boolean;
  float_hours: number;
  downstream_process_count: number;
  total_process_count: number;
  priority_tier: ManufacturingPriorityTier;
  priority_score: number;
  priority_reason: string;
  is_priority_manual_override: boolean;
  process_allocation_fraction: number;
  process_allocations: ManufacturingProcessAllocation[];
  preferred_supplier_id: string | null;
  preferred_supplier_name: string | null;
  source_pr_id: string;
  source_pr_number: string;
  source_pr_item_id: string;
  expected_delivery_date: string | null;
}

/**
 * Computes the complete Manufacturing Context from:
 * 1. Setup & Master Produksi (Station start dates, WOT lot cadence, shift hours, factory factor, CPM)
 * 2. PR & Project BOM MRP Netting (Gross BOM - Warehouse Free Stock - Project Reservations - Active PRs)
 * 3. Bill of Processes (BOP Product Cards -> Downstream Process Consumers, Critical Path, and Smart Auto-Priority)
 */
function resolveProjectManufacturingContext(projectId: string): {
  project: any;
  masterSchedule: {
    master_start_date: string;
    master_end_date: string;
    target_order_qty: number;
    master_lot_size: number;
    total_wot_lots: number;
    shift_hours: number;
    factory_factor: number;
    single_wot_critical_hours: number;
    bottleneck_wot_hours: number;
    wot_cadence_days: number;
    production_horizon_days: number;
  };
  mrpSummary: {
    total_bom_items: number;
    gross_bom_total_qty: number;
    warehouse_free_usable_qty: number;
    project_allocated_qty: number;
    existing_pr_qty: number;
    net_shortage_qty: number;
    source_mode: "BOM_MRP" | "PR_QUEUE" | "HYBRID";
    unallocated_bom_items: UnallocatedBomGateItem[];
  };
  bopSteps: any[];
  stepSchedules: BopStepScheduleNode[];
  stationClusters: {
    station_id: string;
    station_code: string;
    station_name: string;
    cluster_sequence: number;
    start_date: string;
    start_offset_days: number;
    wot_hours: number;
    process_names: string[];
  }[];
  items: RawCandidateItem[];
} {
  const todayIso = new Date().toISOString().split("T")[0];

  const project =
    (db
      .prepare(
        `SELECT p.*,
                COALESCE(p.spk_number, s.spk_number) as resolved_spk_number,
                COALESCE(NULLIF(p.planned_completion_date, ''), NULLIF(p.due_date, '2099-12-31'), s.target_completion_date, s.due_date) as resolved_end_date
         FROM projects p
         LEFT JOIN spks s ON s.project_id = p.id OR s.spk_number = p.spk_number
         WHERE p.id = ? OR p.spk_number = ?
         LIMIT 1`,
      )
      .get(projectId, projectId) as any) || {
      id: projectId,
      name: projectId === "GENERAL" ? "General Operations" : projectId,
      spk_number: null,
      resolved_spk_number: null,
      start_date: todayIso,
      due_date: null,
      resolved_end_date: null,
      qty: 50,
      lot_size: 10,
      shift_hours: 8,
      factory_factor: 85,
    };

  const actualProjectId = project.id || projectId;
  const spkRef =
    project.resolved_spk_number || project.spk_number || actualProjectId;

  // 1. Setup & Master Parameters
  const targetOrderQty = Math.max(1, Number(project.qty) || 50);
  const masterLotSize = Math.max(
    1,
    Math.min(targetOrderQty, Number(project.lot_size) || 10),
  );
  const totalWotLots = Math.max(1, Math.ceil(targetOrderQty / masterLotSize));
  const shiftHours = Math.max(1, Number(project.shift_hours) || 8);
  const factoryFactor = Math.max(20, Number(project.factory_factor) || 85);
  const ffRatio = factoryFactor / 100;

  const masterStartDate = project.start_date
    ? String(project.start_date).slice(0, 10)
    : todayIso;

  // Purge any ghost BOP-TSK / procurement rows from bill_of_processes for this project
  try {
    db.prepare(
      `DELETE FROM bill_of_processes
       WHERE (project_id = ? OR project_id = ?)
         AND (
           id LIKE 'BOP-TSK-%'
           OR legacy_task_id LIKE 'TSK-%'
           OR process_name LIKE '[Procurement]%'
           OR process_name LIKE 'Materials:%'
           OR process_name LIKE 'Arrival:%'
           OR process_name LIKE 'Material Procurement%'
           OR process_name LIKE 'SPK Material Procurement%'
           OR process_name LIKE 'ECO Procurement Revision%'
         )`,
    ).run(actualProjectId, spkRef);
  } catch (_) {}

  // Fetch stations & clean BOP steps
  const stationsList = db
    .prepare(
      `SELECT id, station_code, station_name, station_sequence, project_id
       FROM project_stations
       WHERE project_id = ? OR project_id = ?
       UNION ALL
       SELECT id, station_code, station_name, station_sequence, project_id
       FROM stations
       WHERE project_id = ? OR project_id = ? OR project_id IS NULL
       ORDER BY station_sequence ASC, station_code ASC`,
    )
    .all(actualProjectId, spkRef, actualProjectId, spkRef) as any[];

  const rawBopSteps = db
    .prepare(
      `SELECT * FROM bill_of_processes
       WHERE project_id = ? OR project_id = ?
       ORDER BY step_sequence ASC`,
    )
    .all(actualProjectId, spkRef) as any[];

  const bopSteps = rawBopSteps.filter((s) => {
    const idStr = String(s?.id || "").trim();
    const legacyStr = String(s?.legacy_task_id || "").trim();
    const nameStr = String(s?.process_name || "").trim();
    if (idStr.startsWith("BOP-TSK-") || legacyStr.startsWith("TSK-")) return false;
    if (
      nameStr.startsWith("[Procurement]") ||
      nameStr.startsWith("Materials:") ||
      nameStr.startsWith("Arrival:") ||
      nameStr.startsWith("Material Procurement") ||
      nameStr.startsWith("SPK Material Procurement") ||
      nameStr.startsWith("ECO Procurement Revision")
    ) {
      return false;
    }
    return true;
  });

  // Fetch Project BOM rows to map bom_id -> item_id, required_qty, priority
  const projectBoms = db
    .prepare(
      `SELECT pb.*, i.item_code, i.name as item_name, i.category as item_category, i.uom
       FROM boms pb
       LEFT JOIN items i ON pb.item_id = i.id
       WHERE pb.project_id = ? OR pb.project_id = ?`,
    )
    .all(actualProjectId, spkRef) as any[];

  const bomById = new Map<string, any>();
  const bomByItemId = new Map<string, any>();
  projectBoms.forEach((b) => {
    if (b.id) bomById.set(String(b.id), b);
    if (b.item_id && !bomByItemId.has(String(b.item_id))) {
      bomByItemId.set(String(b.item_id), b);
    }
  });

  // 2. Build Setup Master CPM & Station Schedule for BOP Steps
  const parsedSteps = bopSteps.map((s, idx) => {
    let preds: string[] = [];
    try {
      preds =
        typeof s.predecessor_ids === "string"
          ? JSON.parse(s.predecessor_ids || "[]")
          : Array.isArray(s.predecessor_ids)
            ? s.predecessor_ids
            : [];
    } catch (_e) {
      preds = [];
    }

    let machineIds: string[] = [];
    try {
      if (Array.isArray(s.assigned_machine_ids)) {
        machineIds = s.assigned_machine_ids.filter(Boolean);
      } else if (typeof s.assigned_machine_ids_json === "string" && s.assigned_machine_ids_json.trim()) {
        const arr = JSON.parse(s.assigned_machine_ids_json);
        if (Array.isArray(arr)) machineIds = arr.filter(Boolean);
      }
    } catch (_e) {}
    if (machineIds.length === 0 && (s.assigned_machine_id || s.machine_id)) {
      machineIds = [String(s.assigned_machine_id || s.machine_id)];
    }

    const nodeType: "PROCESS" | "PRODUCT" =
      String(s.node_type || "PROCESS").toUpperCase() === "PRODUCT"
        ? "PRODUCT"
        : "PROCESS";

    const stId =
      s.station_id ||
      (stationsList.length > 0
        ? stationsList[idx % stationsList.length]?.id
        : `STN-0${(idx % 3) + 1}`);
    const stObj = stationsList.find(
      (st) => st.id === stId || st.station_code === stId,
    );

    const baseCt =
      nodeType === "PRODUCT"
        ? 0
        : Math.max(1, Number(s.cycle_time_minutes) || 20);
    const mCount = Math.max(1, machineIds.length);
    const speedMult =
      mCount > 1
        ? Math.max(1.0, Number(s.machine_efficiency_multiplier) || 1.5)
        : 1.0;
    const compoundDivisor = mCount > 1 ? Math.pow(speedMult, mCount - 1) : 1.0;
    const effectiveCt = baseCt / compoundDivisor / ffRatio;
    const wotDurationHours =
      nodeType === "PRODUCT"
        ? 0
        : Number(((effectiveCt * masterLotSize) / 60).toFixed(2));

    return {
      raw: s,
      step_id: String(s.id),
      step_sequence: Number(s.step_sequence) || idx + 1,
      process_name:
        s.process_name || s.station_name || `Process Step ${idx + 1}`,
      node_type: nodeType,
      station_id: String(stId),
      station_code: String(stObj?.station_code || stId),
      station_name: String(
        stObj?.station_name || s.station_name || s.process_name || `Workstation ${idx + 1}`,
      ),
      predecessor_ids: preds.map(String),
      wot_duration_hours: nodeType === "PRODUCT" ? 0 : Math.max(0.1, wotDurationHours),
    };
  });

  // Group stations in topological / sequence order (PROCESS nodes only)
  const stationClusterMap = new Map<
    string,
    {
      station_id: string;
      station_code: string;
      station_name: string;
      cluster_sequence: number;
      wot_hours: number;
      process_names: string[];
      earliest_es_hours: number;
    }
  >();
  let clusterSeqCounter = 1;
  parsedSteps.forEach((ps) => {
    if (ps.node_type === "PRODUCT" && parsedSteps.some((x) => x.node_type === "PROCESS")) {
      return;
    }
    if (!stationClusterMap.has(ps.station_id)) {
      stationClusterMap.set(ps.station_id, {
        station_id: ps.station_id,
        station_code: ps.station_code,
        station_name: ps.station_name,
        cluster_sequence: clusterSeqCounter++,
        wot_hours: 0,
        process_names: [],
        earliest_es_hours: Number.POSITIVE_INFINITY,
      });
    }
    const cl = stationClusterMap.get(ps.station_id)!;
    cl.wot_hours = Number((cl.wot_hours + ps.wot_duration_hours).toFixed(2));
    if (!cl.process_names.includes(ps.process_name)) {
      cl.process_names.push(ps.process_name);
    }
  });

  if (stationClusterMap.size === 0) {
    stationClusterMap.set("STN-01", {
      station_id: "STN-01",
      station_code: "STN-01",
      station_name: "Primary Manufacturing Station",
      cluster_sequence: 1,
      wot_hours: 4,
      process_names: ["Cutting & Preparation"],
      earliest_es_hours: 0,
    });
  }

  // Forward pass for ES / EF & DAG Depth using true DAG edges
  const esMap: Record<string, number> = {};
  const efMap: Record<string, number> = {};
  const depthMap: Record<string, number> = {};
  const validStepIds = new Set(parsedSteps.map((s) => s.step_id));
  const hasAnyExplicitEdges = parsedSteps.some((s) =>
    s.predecessor_ids.some((pid) => validStepIds.has(pid)),
  );

  // Multi-pass Bellman-Ford relaxation so out-of-order step_sequence rows still compute exact DAG ES/EF
  parsedSteps.forEach((ps) => {
    esMap[ps.step_id] = 0;
    efMap[ps.step_id] = ps.wot_duration_hours;
    depthMap[ps.step_id] = 0;
  });

  for (let pass = 0; pass < Math.max(1, parsedSteps.length); pass++) {
    let changed = false;
    parsedSteps.forEach((ps, idx) => {
      const validPreds = ps.predecessor_ids.filter((pid) => validStepIds.has(pid));
      const effectivePreds = hasAnyExplicitEdges
        ? validPreds
        : idx > 0
          ? [parsedSteps[idx - 1].step_id]
          : [];

      const maxPredEf =
        effectivePreds.length > 0
          ? Math.max(...effectivePreds.map((pid) => efMap[pid] || 0))
          : 0;
      const maxPredDepth =
        effectivePreds.length > 0
          ? Math.max(...effectivePreds.map((pid) => depthMap[pid] || 0))
          : 0;

      const nextEs = Number(maxPredEf.toFixed(2));
      const nextEf = Number((maxPredEf + ps.wot_duration_hours).toFixed(2));
      const nextDepth = effectivePreds.length > 0 ? maxPredDepth + 1 : 0;

      if (esMap[ps.step_id] !== nextEs || efMap[ps.step_id] !== nextEf) {
        esMap[ps.step_id] = nextEs;
        efMap[ps.step_id] = nextEf;
        depthMap[ps.step_id] = nextDepth;
        changed = true;
      }
    });
    if (!changed) break;
  }

  parsedSteps.forEach((ps) => {
    if (ps.node_type === "PRODUCT") return;
    const cl = stationClusterMap.get(ps.station_id);
    if (cl && esMap[ps.step_id] < cl.earliest_es_hours) {
      cl.earliest_es_hours = esMap[ps.step_id];
    }
  });

  const singleWotCriticalHours =
    Object.values(efMap).length > 0
      ? Math.max(1, ...Object.values(efMap))
      : 8;

  // Backward pass for Critical Path (Float <= 0.05)
  const lfMap: Record<string, number> = {};
  const lsMap: Record<string, number> = {};
  const floatMap: Record<string, number> = {};
  const criticalMap: Record<string, boolean> = {};

  parsedSteps.forEach((ps) => {
    lfMap[ps.step_id] = singleWotCriticalHours;
    lsMap[ps.step_id] = Math.max(0, singleWotCriticalHours - ps.wot_duration_hours);
  });

  for (let pass = 0; pass < Math.max(1, parsedSteps.length); pass++) {
    let changed = false;
    [...parsedSteps].reverse().forEach((ps, revIdx) => {
      const origIdx = parsedSteps.length - 1 - revIdx;
      const explicitSuccs = parsedSteps.filter((other) =>
        other.predecessor_ids.includes(ps.step_id),
      );
      const effectiveSuccs = hasAnyExplicitEdges
        ? explicitSuccs
        : origIdx < parsedSteps.length - 1
          ? [parsedSteps[origIdx + 1]]
          : [];

      const minSuccLs =
        effectiveSuccs.length > 0
          ? Math.min(
              ...effectiveSuccs.map(
                (s) => lsMap[s.step_id] ?? singleWotCriticalHours,
              ),
            )
          : singleWotCriticalHours;

      const nextLf = Number(minSuccLs.toFixed(2));
      const nextLs = Number(
        Math.max(0, minSuccLs - ps.wot_duration_hours).toFixed(2),
      );
      if (lfMap[ps.step_id] !== nextLf || lsMap[ps.step_id] !== nextLs) {
        lfMap[ps.step_id] = nextLf;
        lsMap[ps.step_id] = nextLs;
        changed = true;
      }
    });
    if (!changed) break;
  }

  parsedSteps.forEach((ps) => {
    const flt = Math.max(
      0,
      Number((lsMap[ps.step_id] - esMap[ps.step_id]).toFixed(2)),
    );
    floatMap[ps.step_id] = flt;
    criticalMap[ps.step_id] = flt <= 0.05;
  });

  const stationClustersRaw = Array.from(stationClusterMap.values()).sort(
    (a, b) => a.cluster_sequence - b.cluster_sequence,
  );
  const bottleneckWotHours =
    stationClustersRaw.length > 0
      ? Math.max(...stationClustersRaw.map((c) => c.wot_hours), 2)
      : singleWotCriticalHours;

  const totalNetHours =
    stationClustersRaw.length > 1 && totalWotLots > 1
      ? singleWotCriticalHours + (totalWotLots - 1) * bottleneckWotHours
      : singleWotCriticalHours * totalWotLots;
  const computedEstimatedDays = Math.max(
    1,
    Math.ceil(totalNetHours / shiftHours),
  );

  const masterEndDate =
    project.resolved_end_date &&
    daysBetweenIso(masterStartDate, String(project.resolved_end_date).slice(0, 10)) >= 1
      ? String(project.resolved_end_date).slice(0, 10)
      : addDaysIso(masterStartDate, computedEstimatedDays);

  const productionHorizonDays = Math.max(
    1,
    daysBetweenIso(masterStartDate, masterEndDate),
  );

  const totalClusters = Math.max(1, stationClustersRaw.length);
  const wotCadenceDays =
    totalWotLots <= 1
      ? 0
      : Math.max(
          1,
          Number(
            Math.max(
              bottleneckWotHours / shiftHours,
              (productionHorizonDays * 0.65) / Math.max(1, totalWotLots - 1),
            ).toFixed(1),
          ),
        );

  const stationClusters = stationClustersRaw.map((cl, cIdx) => {
    const finiteEs = Number.isFinite(cl.earliest_es_hours)
      ? cl.earliest_es_hours
      : cIdx * (singleWotCriticalHours / totalClusters);
    const cpmOffsetDays = Math.floor(finiteEs / shiftHours);
    const proportionalStageOffsetDays =
      totalClusters > 1 && finiteEs > 0
        ? Math.round(
            (cIdx / Math.max(1, totalClusters)) *
              Math.min(
                productionHorizonDays * 0.55,
                Math.max(totalClusters * 2, singleWotCriticalHours / shiftHours),
              ),
          )
        : cIdx * 2;
    const startOffsetDays = Math.max(cpmOffsetDays, proportionalStageOffsetDays);
    return {
      station_id: cl.station_id,
      station_code: cl.station_code,
      station_name: cl.station_name,
      cluster_sequence: cl.cluster_sequence,
      start_date: addDaysIso(masterStartDate, startOffsetDays),
      start_offset_days: startOffsetDays,
      wot_hours: cl.wot_hours,
      process_names: cl.process_names,
    };
  });

  const clusterLookup = new Map(
    stationClusters.map((c) => [c.station_id, c]),
  );

  // Build downstream adjacency map to count how many PROCESS nodes depend on each step
  const processParsedSteps = parsedSteps.filter(
    (s) => s.node_type === "PROCESS",
  );
  const effectiveProcessList =
    processParsedSteps.length > 0 ? processParsedSteps : parsedSteps;
  const totalProcessCount = Math.max(1, effectiveProcessList.length);

  const succMap = new Map<string, string[]>();
  parsedSteps.forEach((s) => succMap.set(s.step_id, []));
  parsedSteps.forEach((s, idx) => {
    const validPreds = s.predecessor_ids.filter((pid) => validStepIds.has(pid));
    const effectivePreds = hasAnyExplicitEdges
      ? validPreds
      : idx > 0
        ? [parsedSteps[idx - 1].step_id]
        : [];
    effectivePreds.forEach((pid) => {
      if (succMap.has(pid)) {
        succMap.get(pid)!.push(s.step_id);
      }
    });
  });

  const countDownstreamProcesses = (startStepId: string): number => {
    const visited = new Set<string>();
    const queue = [startStepId];
    let guard = 0;
    while (queue.length > 0 && guard < 1000) {
      guard++;
      const curr = queue.shift()!;
      if (!visited.has(curr)) {
        visited.add(curr);
        const nexts = succMap.get(curr) || [];
        for (const nx of nexts) {
          if (!visited.has(nx)) queue.push(nx);
        }
      }
    }
    const impacted = effectiveProcessList.filter((p) =>
      visited.has(p.step_id),
    ).length;
    return Math.max(1, impacted);
  };

  const stepSchedules: BopStepScheduleNode[] = parsedSteps.map((ps, idx) => {
    const cl =
      clusterLookup.get(ps.station_id) ||
      stationClusters[idx % stationClusters.length];
    const validPreds = ps.predecessor_ids.filter((pid) => validStepIds.has(pid));
    const hasProcessPred = validPreds.some((pid) => {
      const pNode = parsedSteps.find((x) => x.step_id === pid);
      return pNode && pNode.node_type === "PROCESS";
    });
    const isRootStep = !hasProcessPred;
    const stepCpmDays = Math.floor((esMap[ps.step_id] || 0) / shiftHours);
    const startOffsetDays = Math.max(
      cl?.start_offset_days || 0,
      stepCpmDays,
    );
    const downstreamProcessCount = countDownstreamProcesses(ps.step_id);
    return {
      step_id: ps.step_id,
      step_sequence: ps.step_sequence,
      process_name: ps.process_name,
      node_type: ps.node_type,
      station_id: cl.station_id,
      station_code: cl.station_code,
      station_name: cl.station_name,
      station_cluster_seq: cl.cluster_sequence,
      predecessor_ids: validPreds,
      wot_duration_hours: ps.wot_duration_hours,
      es_wot_hours: esMap[ps.step_id] || 0,
      ef_wot_hours: efMap[ps.step_id] || 0,
      float_wot_hours: floatMap[ps.step_id] || 0,
      is_critical_path: Boolean(criticalMap[ps.step_id]),
      is_root_step: isRootStep,
      dag_depth: depthMap[ps.step_id] || 0,
      downstream_process_count: downstreamProcessCount,
      total_process_count: totalProcessCount,
      station_start_offset_days: startOffsetDays,
      station_start_date: addDaysIso(masterStartDate, startOffsetDays),
    };
  });

  const stepScheduleById = new Map(
    stepSchedules.map((s) => [s.step_id, s]),
  );

  // 3. Map BOM / Item Allocations across BOP Product Cards (e.g. M-A -> Process A, M-B -> Process B)
  const allocationsByBomOrItemKey = new Map<
    string,
    ManufacturingProcessAllocation[]
  >();

  parsedSteps.forEach((ps) => {
    let rawAllocs: any[] = [];
    try {
      rawAllocs =
        typeof ps.raw.bom_allocations === "string"
          ? JSON.parse(ps.raw.bom_allocations || "[]")
          : Array.isArray(ps.raw.bom_allocations)
            ? ps.raw.bom_allocations
            : [];
    } catch (_e) {
      rawAllocs = [];
    }

    if (rawAllocs.length === 0) return;

    // For a PRODUCT node (e.g. M-A, M-B), resolve the immediate downstream PROCESS node that consumes it
    let targetScheduleNode = stepScheduleById.get(ps.step_id)!;
    if (ps.node_type === "PRODUCT") {
      const consumingProcess = parsedSteps.find(
        (other) =>
          other.node_type === "PROCESS" &&
          other.predecessor_ids.includes(ps.step_id),
      );
      const producingProcess = parsedSteps.find(
        (other) =>
          other.node_type === "PROCESS" &&
          ps.predecessor_ids.includes(other.step_id),
      );
      const chosenProcess = consumingProcess || producingProcess;
      if (chosenProcess && stepScheduleById.has(chosenProcess.step_id)) {
        targetScheduleNode = stepScheduleById.get(chosenProcess.step_id)!;
      }
    }

    rawAllocs.forEach((a: any) => {
      const bomId = a.bom_id ? String(a.bom_id) : null;
      const bomRow = bomId ? bomById.get(bomId) : null;
      const itemId = a.item_id
        ? String(a.item_id)
        : bomRow?.item_id
          ? String(bomRow.item_id)
          : null;

      const totalBomReq = Number(bomRow?.required_qty || bomRow?.qty || 0);
      const rawFrac =
        a.fraction !== undefined && Number(a.fraction) > 0
          ? Number(a.fraction)
          : a.qty !== undefined && totalBomReq > 0
            ? Number(a.qty) / totalBomReq
            : 1;
      const fraction = Math.max(0.01, Math.min(1, rawFrac));

      const displayProcessStepName =
        ps.node_type === "PRODUCT"
          ? `[${ps.process_name}] → ${targetScheduleNode.process_name}`
          : targetScheduleNode.process_name;

      const allocEntry: ManufacturingProcessAllocation = {
        bop_step_id: targetScheduleNode.step_id,
        step_sequence: targetScheduleNode.step_sequence,
        process_step_name: displayProcessStepName,
        product_node_id: ps.node_type === "PRODUCT" ? ps.step_id : null,
        product_node_name: ps.node_type === "PRODUCT" ? ps.process_name : null,
        consuming_process_name: targetScheduleNode.process_name,
        station_id: targetScheduleNode.station_id,
        station_code: targetScheduleNode.station_code,
        station_name: targetScheduleNode.station_name,
        station_cluster_seq: targetScheduleNode.station_cluster_seq,
        fraction,
        is_critical_path: targetScheduleNode.is_critical_path,
        is_root_step: targetScheduleNode.is_root_step,
        dag_depth: targetScheduleNode.dag_depth,
        float_wot_hours: targetScheduleNode.float_wot_hours,
        downstream_process_count: targetScheduleNode.downstream_process_count,
        total_process_count: targetScheduleNode.total_process_count,
        station_start_date: targetScheduleNode.station_start_date,
        station_start_offset_days: targetScheduleNode.station_start_offset_days,
      };

      if (bomId) {
        const list = allocationsByBomOrItemKey.get(`BOM:${bomId}`) || [];
        list.push(allocEntry);
        allocationsByBomOrItemKey.set(`BOM:${bomId}`, list);
      }
      if (itemId) {
        const list = allocationsByBomOrItemKey.get(`ITEM:${itemId}`) || [];
        list.push(allocEntry);
        allocationsByBomOrItemKey.set(`ITEM:${itemId}`, list);
      }
    });
  });

  // 4. Resolve Supplier Pricing & Lead Time
  const fallbackSupplier = db
    .prepare("SELECT id, name FROM suppliers ORDER BY name ASC LIMIT 1")
    .get() as { id: string; name: string } | undefined;

  const getBestSupplier = (itemId: string, fallbackPrice: number) => {
    const supRow = db
      .prepare(
        `SELECT isp.supplier_id, isp.unit_price, s.name as supplier_name
         FROM item_supplier_prices isp
         JOIN suppliers s ON s.id = isp.supplier_id
         WHERE isp.item_id = ? AND isp.unit_price > 0
         ORDER BY isp.unit_price ASC
         LIMIT 1`,
      )
      .get(itemId) as any;

    const itemRow = db
      .prepare(
        "SELECT unit_price, lead_time_days, category FROM items WHERE id = ?",
      )
      .get(itemId) as any;

    const resolvedPrice =
      Number(supRow?.unit_price) ||
      Number(fallbackPrice) ||
      Number(itemRow?.unit_price) ||
      15000;
    const leadTime = Math.max(1, Number(itemRow?.lead_time_days) || 4);

    return {
      unit_price: resolvedPrice,
      lead_time_days: leadTime,
      category: String(itemRow?.category || "RAW_MATERIAL"),
      supplier_id: supRow?.supplier_id || fallbackSupplier?.id || null,
      supplier_name: supRow?.supplier_name || fallbackSupplier?.name || null,
    };
  };

  // 5. Pull Open PR Items & Compute Project BOM MRP Netting (Gross BOM - Warehouse Free Stock - Reservations - Active PRs)
  const pendingPrRows = db
    .prepare(
      `SELECT
         pri.id as pr_item_id,
         pri.pr_id,
         pr.pr_number,
         pri.item_id,
         i.item_code,
         i.name as item_name,
         COALESCE(i.category, 'RAW_MATERIAL') as item_category,
         COALESCE(pri.dimension, i.dimension, '') as dimension,
         COALESCE(pri.spec, i.spec, '') as spec,
         COALESCE(i.uom, 'PCS') as uom,
         pri.qty,
         COALESCE(pri.unit_price, i.unit_price, 0) as unit_price,
         pri.expected_delivery_date
       FROM pr_items pri
       JOIN purchase_requests pr ON pri.pr_id = pr.id
       JOIN items i ON pri.item_id = i.id
       WHERE pri.po_id IS NULL
         AND pri.plan_id IS NULL
         AND COALESCE(pr.archived, 0) = 0
         AND pr.status NOT IN ('CANCELLED', 'REVISION')
         AND COALESCE(pr.project_id, 'GENERAL') = ?
       ORDER BY pri.qty DESC`,
    )
    .all(actualProjectId) as any[];

  let grossBomTotalQty = 0;
  let warehouseFreeUsableQty = 0;
  let projectAllocatedTotalQty = 0;
  let existingPrTotalQty = 0;
  let netShortageTotalQty = 0;

  const mrpByItemId = new Map<
    string,
    {
      gross_bom_qty: number;
      warehouse_free_qty: number;
      project_allocated_qty: number;
      existing_pr_qty: number;
      unplanned_pr_qty: number;
      net_shortage_qty: number;
    }
  >();

  const unallocatedBomItems: UnallocatedBomGateItem[] = [];
  const synthesizedBomCandidates: any[] = [];

  for (const b of projectBoms) {
    if (!b.item_id) continue;
    const itemIdStr = String(b.item_id);
    const bomIdStr = String(b.id || itemIdStr);
    // Notice: In engineering BOM sync, b.required_qty is per 1 unit of project (or total if project.qty = 1)
    const grossBomQty = Math.max(
      0,
      Number(b.required_qty || b.qty || 1) * targetOrderQty,
    );

    // Check BOP Product Card allocations for this BOM item
    const matchedProductAllocs =
      (b.id && allocationsByBomOrItemKey.get(`BOM:${b.id}`)) ||
      allocationsByBomOrItemKey.get(`ITEM:${itemIdStr}`) ||
      [];
    const totalAllocatedFraction = Math.min(
      1,
      Number(
        matchedProductAllocs
          .reduce((sum, a) => sum + Number(a.fraction || 0), 0)
          .toFixed(4),
      ),
    );

    if (matchedProductAllocs.length === 0 || totalAllocatedFraction < 0.999) {
      const unallocFraction = Math.max(0, 1 - totalAllocatedFraction);
      unallocatedBomItems.push({
        bom_id: bomIdStr,
        item_id: itemIdStr,
        item_code: b.item_code || itemIdStr,
        item_name: b.item_name || "BOM Material",
        uom: b.uom || "PCS",
        gross_bom_qty: grossBomQty,
        allocated_fraction: totalAllocatedFraction,
        unallocated_qty: Number((grossBomQty * unallocFraction).toFixed(2)),
      });
    }

    const stockRow = db
      .prepare(
        "SELECT COALESCE(SUM(qty), 0) as total_stock FROM inventory WHERE item_id = ?",
      )
      .get(itemIdStr) as { total_stock: number } | undefined;
    const totalPhysicalStock = Math.max(0, Number(stockRow?.total_stock || 0));

    const thisAllocRow = db
      .prepare(
        `SELECT COALESCE(SUM(qty), 0) as allocated
         FROM stock_movements
         WHERE project_id = ? AND item_id = ? AND type IN ('ALLOCATION', 'GRN_ALLOCATION', 'GRN')`,
      )
      .get(actualProjectId, itemIdStr) as { allocated: number } | undefined;
    const thisConsumedRow = db
      .prepare(
        `SELECT COALESCE(SUM(qty_consumed), 0) as consumed
         FROM bom_item_consumption
         WHERE project_id = ? AND item_id = ?`,
      )
      .get(actualProjectId, itemIdStr) as { consumed: number } | undefined;

    const thisConsumed = Math.max(0, Number(thisConsumedRow?.consumed || 0));
    const thisAllocatedUnconsumed = Math.max(
      0,
      Number(thisAllocRow?.allocated || 0) - thisConsumed,
    );
    const thisProjectCoveredByStock = thisConsumed + thisAllocatedUnconsumed;

    const allAllocRow = db
      .prepare(
        `SELECT
           COALESCE((SELECT SUM(qty) FROM stock_movements WHERE item_id = ? AND type IN ('ALLOCATION', 'GRN_ALLOCATION', 'GRN') AND project_id IS NOT NULL), 0) -
           COALESCE((SELECT SUM(qty_consumed) FROM bom_item_consumption WHERE item_id = ?), 0) as net_allocated`,
      )
      .get(itemIdStr, itemIdStr) as { net_allocated: number } | undefined;
    const totalReservedInWarehouse = Math.max(
      0,
      Number(allAllocRow?.net_allocated || 0),
    );
    const warehouseFreeStock = Math.max(
      0,
      totalPhysicalStock - totalReservedInWarehouse,
    );

    const lockedOrOrderedPrRow = db
      .prepare(
        `SELECT COALESCE(SUM(pri.qty), 0) as locked_qty
         FROM pr_items pri
         JOIN purchase_requests pr ON pri.pr_id = pr.id
         WHERE COALESCE(pr.project_id, 'GENERAL') = ?
           AND pri.item_id = ?
           AND COALESCE(pr.archived, 0) = 0
           AND pr.status NOT IN ('CANCELLED', 'COMPLETED')
           AND (pri.plan_id IS NOT NULL OR pri.po_id IS NOT NULL)`,
      )
      .get(actualProjectId, itemIdStr) as { locked_qty: number } | undefined;
    const lockedOrOrderedPrQty = Math.max(
      0,
      Number(lockedOrOrderedPrRow?.locked_qty || 0),
    );

    const unplannedPrForItem = pendingPrRows
      .filter((r) => String(r.item_id) === itemIdStr)
      .reduce((s, r) => s + Number(r.qty || 0), 0);

    const totalActivePrForItem = lockedOrOrderedPrQty + unplannedPrForItem;

    // Only plan the portion of Gross BOM that Engineering has explicitly allocated to BOP Product Cards
    const allocatedGrossBomQty = Number(
      (grossBomQty * totalAllocatedFraction).toFixed(4),
    );

    const remainingAfterProjectAlloc = Math.max(
      0,
      allocatedGrossBomQty - thisProjectCoveredByStock - lockedOrOrderedPrQty,
    );
    const usableFreeStock = Math.min(
      remainingAfterProjectAlloc,
      warehouseFreeStock,
    );
    const netShortageBeforeUnplannedPr = Math.max(
      0,
      remainingAfterProjectAlloc - usableFreeStock,
    );
    const uncoveredShortageAfterUnplannedPr = Math.max(
      0,
      netShortageBeforeUnplannedPr - unplannedPrForItem,
    );

    grossBomTotalQty += grossBomQty;
    warehouseFreeUsableQty += usableFreeStock;
    projectAllocatedTotalQty += thisProjectCoveredByStock;
    existingPrTotalQty += totalActivePrForItem;
    netShortageTotalQty += netShortageBeforeUnplannedPr;

    mrpByItemId.set(itemIdStr, {
      gross_bom_qty: grossBomQty,
      warehouse_free_qty: warehouseFreeStock,
      project_allocated_qty: thisProjectCoveredByStock,
      existing_pr_qty: totalActivePrForItem,
      unplanned_pr_qty: unplannedPrForItem,
      net_shortage_qty: netShortageBeforeUnplannedPr,
    });

    // Strict BOP Product Card Allocation Gate:
    // Do NOT synthesize a Procurement Plan candidate if Engineering has not allocated this BOM item to any BOP Product Card
    if (matchedProductAllocs.length === 0) {
      continue;
    }

    const candidateQtyToPlan =
      uncoveredShortageAfterUnplannedPr > 0
        ? uncoveredShortageAfterUnplannedPr
        : unplannedPrForItem === 0 &&
            lockedOrOrderedPrQty === 0 &&
            pendingPrRows.length === 0 &&
            allocatedGrossBomQty > 0
          ? Math.max(1, allocatedGrossBomQty - thisProjectCoveredByStock)
          : 0;

    if (candidateQtyToPlan > 0) {
      const itemMeta = db
        .prepare(
          "SELECT item_code, name, category, dimension, spec, uom, unit_price FROM items WHERE id = ?",
        )
        .get(itemIdStr) as any;

      synthesizedBomCandidates.push({
        pr_item_id: `BOM-MRP-${b.id || itemIdStr}`,
        pr_id: `BOM-MRP-${actualProjectId}`,
        pr_number: "BOM-MRP (Unrequested)",
        item_id: itemIdStr,
        item_code: b.item_code || itemMeta?.item_code || itemIdStr,
        item_name: b.item_name || itemMeta?.name || "BOM Material",
        item_category: b.item_category || itemMeta?.category || "RAW_MATERIAL",
        dimension: b.dimension || itemMeta?.dimension || "",
        spec: b.spec || itemMeta?.spec || "",
        uom: b.uom || itemMeta?.uom || "PCS",
        qty: candidateQtyToPlan,
        unit_price: Number(itemMeta?.unit_price || 0),
        expected_delivery_date: null,
        source_origin: "BOM_MRP" as const,
      });
    }
  }

  const combinedSourceRows = [
    ...pendingPrRows.map((r) => ({
      ...r,
      source_origin: "PR_QUEUE" as const,
    })),
    ...synthesizedBomCandidates,
  ];

  // Build RawCandidateItem list:
  // Confirmed Rule 1: Split per BOP Product Card (e.g. M-A for Process A, M-B for Process B)
  // Confirmed Rule 3: Exclude any project BOM item that is NOT allocated to a BOP Product Card
  const rawItems: RawCandidateItem[] = [];

  for (const row of combinedSourceRows) {
    const supInfo = getBestSupplier(row.item_id, row.unit_price);
    const bomRow = bomByItemId.get(String(row.item_id)) || null;
    const bomId = bomRow?.id ? String(bomRow.id) : null;
    const itemMrp = mrpByItemId.get(String(row.item_id));

    const matchedAllocs =
      (bomId && allocationsByBomOrItemKey.get(`BOM:${bomId}`)) ||
      allocationsByBomOrItemKey.get(`ITEM:${row.item_id}`) ||
      [];

    // Strict Product Card Gate for Manufacturing Projects:
    // If this project has a BOM/BOP (not GENERAL), require the item to be allocated to a BOP Product Card
    if (actualProjectId !== "GENERAL" && matchedAllocs.length === 0) {
      continue;
    }

    const effectiveAllocs: ManufacturingProcessAllocation[] =
      matchedAllocs.length > 0
        ? matchedAllocs
        : [
            {
              bop_step_id: "BOP-STEP-1",
              step_sequence: 1,
              process_step_name:
                stationClusters[0]?.process_names?.[0] ||
                "Cutting & Preparation",
              product_node_id: null,
              product_node_name: null,
              consuming_process_name:
                stationClusters[0]?.process_names?.[0] ||
                "Cutting & Preparation",
              station_id: stationClusters[0]?.station_id || "STN-01",
              station_code: stationClusters[0]?.station_code || "STN-01",
              station_name: stationClusters[0]?.station_name || "Station 1",
              station_cluster_seq: 1,
              fraction: 1,
              is_critical_path: true,
              is_root_step: true,
              dag_depth: 0,
              float_wot_hours: 0,
              downstream_process_count: 1,
              total_process_count: 1,
              station_start_date: masterStartDate,
              station_start_offset_days: 0,
            },
          ];

    const totalFrac = effectiveAllocs.reduce((s, a) => s + a.fraction, 0);
    const normalizedAllocs = effectiveAllocs
      .map((a) => ({
        ...a,
        fraction:
          totalFrac > 0
            ? Number((a.fraction / totalFrac).toFixed(4))
            : Number((1 / effectiveAllocs.length).toFixed(4)),
      }))
      .sort((a, b) => a.step_sequence - b.step_sequence);

    const totalRowQty = Math.max(0.01, Number(row.qty) || 1);
    const isIntRowQty = Math.abs(totalRowQty - Math.round(totalRowQty)) < 1e-4;
    let remainingSplitQty = totalRowQty;

    normalizedAllocs.forEach((alloc, allocIdx) => {
      const isLastAlloc = allocIdx === normalizedAllocs.length - 1;
      const rawSplitQty = isLastAlloc
        ? remainingSplitQty
        : isIntRowQty && totalRowQty >= normalizedAllocs.length
          ? Math.max(1, Math.round(totalRowQty * alloc.fraction))
          : Number((totalRowQty * alloc.fraction).toFixed(4));
      const splitQty = Math.min(remainingSplitQty, Math.max(0.01, rawSplitQty));
      remainingSplitQty = Number((remainingSplitQty - splitQty).toFixed(4));

      const nameCatUpper = `${row.item_name} ${row.item_category} ${row.spec}`.toUpperCase();
      const isConsumableOrSupporting =
        /CONSUMABLE|FASTENER|BOLT|NUT|WASHER|SCREW|PACKAGING|CARTON|LABEL|PAINT|THINNER|ABRASIVE|WELDING ROD|ELECTRODE|FINISHING/.test(
          nameCatUpper,
        );

      const blockingRatio = Math.min(
        1,
        alloc.downstream_process_count /
          Math.max(1, alloc.total_process_count),
      );
      const blockingScore = Math.round(blockingRatio * 40);

      const cpmBase = alloc.is_critical_path
        ? 25
        : alloc.float_wot_hours <= 2
          ? 15
          : 6;
      const leadTimeTightness =
        supInfo.lead_time_days >= alloc.station_start_offset_days
          ? 10
          : supInfo.lead_time_days >=
              Math.max(1, alloc.station_start_offset_days - 2)
            ? 6
            : 2;
      const cpmScore = Math.min(35, cpmBase + leadTimeTightness);

      let depthRoleScore = 15;
      if (isConsumableOrSupporting) {
        depthRoleScore = 4;
      } else if (
        alloc.is_root_step ||
        alloc.station_cluster_seq === 1 ||
        blockingRatio >= 0.75
      ) {
        depthRoleScore = 25;
      } else if (
        alloc.downstream_process_count <= 1 &&
        alloc.total_process_count >= 3
      ) {
        depthRoleScore = 6;
      }

      const priorityScore = Math.min(
        100,
        Math.max(12, blockingScore + cpmScore + depthRoleScore),
      );

      let computedPriority: ManufacturingPriorityTier = "CORE_PROCESS";
      if (
        !isConsumableOrSupporting &&
        (priorityScore >= 68 || (alloc.is_root_step && alloc.is_critical_path))
      ) {
        computedPriority = "CRITICAL_MAIN";
      } else if (
        isConsumableOrSupporting ||
        priorityScore < 38 ||
        (alloc.downstream_process_count <= 1 &&
          alloc.total_process_count >= 3 &&
          !alloc.is_critical_path)
      ) {
        computedPriority = "SUPPORTING";
      } else {
        computedPriority = "CORE_PROCESS";
      }

      const cpmReasonTag = alloc.is_critical_path
        ? "CPM"
        : `Float ${alloc.float_wot_hours}h`;
      const blockReasonTag = `Blocks ${alloc.downstream_process_count}/${alloc.total_process_count} steps`;
      const prodCardTag = alloc.product_node_name
        ? `Card ${alloc.product_node_name} (${Math.round(alloc.fraction * 100)}%) · `
        : "";
      const priorityReason = `${prodCardTag}${cpmReasonTag} · ${blockReasonTag}`;

      const fullGrossBom =
        itemMrp?.gross_bom_qty ||
        Math.max(
          totalRowQty,
          Number(bomRow?.required_qty || 0) * targetOrderQty || totalRowQty,
        );
      const splitGrossBom = Number((fullGrossBom * alloc.fraction).toFixed(4));

      const singleAllocForThisCard: ManufacturingProcessAllocation = {
        ...alloc,
        fraction: 1,
      };

      rawItems.push({
        item_id: row.item_id,
        item_code: row.item_code || row.item_id,
        item_name: row.item_name || "Material Item",
        category: row.item_category || supInfo.category,
        dimension: row.dimension || "",
        spec: row.spec || "",
        uom: row.uom || "PCS",
        qty: splitQty,
        bom_required_qty: splitGrossBom,
        gross_bom_qty: splitGrossBom,
        warehouse_free_qty: Number(
          ((itemMrp?.warehouse_free_qty ?? 0) * alloc.fraction).toFixed(2),
        ),
        project_allocated_qty: Number(
          ((itemMrp?.project_allocated_qty ?? 0) * alloc.fraction).toFixed(2),
        ),
        existing_pr_qty: Number(
          (
            (itemMrp?.existing_pr_qty ??
              (row.source_origin === "PR_QUEUE" ? totalRowQty : 0)) *
            alloc.fraction
          ).toFixed(2),
        ),
        net_shortage_qty: splitQty,
        source_origin: row.source_origin || "PR_QUEUE",
        unit_price: supInfo.unit_price,
        lead_time_days: supInfo.lead_time_days,
        bom_id: bomId,
        product_node_id: alloc.product_node_id || null,
        product_node_name: alloc.product_node_name || null,
        consuming_process_name:
          alloc.consuming_process_name || alloc.process_step_name,
        bop_step_id: alloc.bop_step_id,
        process_step_name: alloc.process_step_name,
        step_sequence: alloc.step_sequence,
        station_id: alloc.station_id,
        station_code: alloc.station_code,
        station_name: alloc.station_name,
        station_cluster_seq: alloc.station_cluster_seq,
        station_start_date: alloc.station_start_date,
        station_start_offset_days: alloc.station_start_offset_days,
        is_critical_path: alloc.is_critical_path,
        is_root_step: alloc.is_root_step,
        float_hours: alloc.float_wot_hours,
        downstream_process_count: alloc.downstream_process_count,
        total_process_count: alloc.total_process_count,
        priority_tier: computedPriority,
        priority_score: priorityScore,
        priority_reason: priorityReason,
        is_priority_manual_override: false,
        process_allocation_fraction: alloc.fraction,
        process_allocations: [singleAllocForThisCard],
        preferred_supplier_id: supInfo.supplier_id,
        preferred_supplier_name: supInfo.supplier_name,
        source_pr_id: row.pr_id,
        source_pr_number: row.pr_number,
        source_pr_item_id:
          normalizedAllocs.length > 1
            ? `${row.pr_item_id}__${alloc.product_node_id || alloc.bop_step_id}`
            : row.pr_item_id,
        expected_delivery_date: row.expected_delivery_date || null,
      });
    });
  }

  const sourceMode: "BOM_MRP" | "PR_QUEUE" | "HYBRID" =
    pendingPrRows.length > 0 && synthesizedBomCandidates.length > 0
      ? "HYBRID"
      : synthesizedBomCandidates.length > 0
        ? "BOM_MRP"
        : "PR_QUEUE";

  return {
    project,
    masterSchedule: {
      master_start_date: masterStartDate,
      master_end_date: masterEndDate,
      target_order_qty: targetOrderQty,
      master_lot_size: masterLotSize,
      total_wot_lots: totalWotLots,
      shift_hours: shiftHours,
      factory_factor: factoryFactor,
      single_wot_critical_hours: singleWotCriticalHours,
      bottleneck_wot_hours: bottleneckWotHours,
      wot_cadence_days: wotCadenceDays,
      production_horizon_days: productionHorizonDays,
    },
    mrpSummary: {
      total_bom_items: projectBoms.length,
      gross_bom_total_qty: Number(grossBomTotalQty.toFixed(2)),
      warehouse_free_usable_qty: Number(warehouseFreeUsableQty.toFixed(2)),
      project_allocated_qty: Number(projectAllocatedTotalQty.toFixed(2)),
      existing_pr_qty: Number(existingPrTotalQty.toFixed(2)),
      net_shortage_qty: Number(
        (netShortageTotalQty || rawItems.reduce((s, i) => s + i.qty, 0)).toFixed(2),
      ),
      source_mode: sourceMode,
      unallocated_bom_items: unallocatedBomItems,
    },
    bopSteps,
    stepSchedules,
    stationClusters,
    items: rawItems,
  };
}

/**
 * Manufacturing-Driven Procurement Wave Simulation Engine (Reset from 0):
 * - No Warehouse or Finance Sweetspot caps.
 * - Waves are built from:
 *   1. Setup Master station start dates & WOT lot cadence (Target Arrival Date = Station/Lot Need Date - Safety Buffer)
 *   2. BOP Product Card -> Consuming Process allocations (e.g. [M-A] -> Process A, [M-B] -> Process B)
 *   3. Automated Smart BOP Graph Priority (CRITICAL_MAIN, CORE_PROCESS, SUPPORTING)
 */
function buildManufacturingWaveSimulation(params: {
  project_id: string;
  strategy_mode?: ManufacturingStrategyMode | string;
  wot_lots_per_wave?: number;
  lead_time_buffer_days?: number;
}) {
  const strategyMode = normalizeStrategyMode(params.strategy_mode);
  const bufferDays = Math.max(1, Number(params.lead_time_buffer_days) || 3);

  const {
    project,
    masterSchedule,
    mrpSummary,
    bopSteps,
    stepSchedules,
    stationClusters,
    items,
  } = resolveProjectManufacturingContext(params.project_id);

  const totalWotLots = Math.max(1, masterSchedule.total_wot_lots);
  const defaultLotsPerWave = Math.max(
    1,
    Math.ceil(totalWotLots / Math.min(3, Math.max(1, totalWotLots))),
  );
  const wotLotsPerWave = Math.max(
    1,
    Math.min(
      totalWotLots,
      Number(params.wot_lots_per_wave) || defaultLotsPerWave,
    ),
  );

  // Number of WOT batch groups when splitting across WOT production lots
  const wotBatchGroupsCount =
    strategyMode === "BOP_PROCESS_SEQUENCE"
      ? 1
      : Math.max(1, Math.ceil(totalWotLots / wotLotsPerWave));

  const totalLotQty = Number(
    items.reduce((sum, it) => sum + Number(it.qty || 0), 0).toFixed(4),
  );
  const totalEstimatedBudget = Math.round(
    items.reduce(
      (sum, it) => sum + Number(it.qty || 0) * Number(it.unit_price || 0),
      0,
    ),
  );

  interface ManufacturingWaveBucket {
    stageKey: string;
    station_id: string;
    station_code: string;
    station_name: string;
    station_cluster_seq: number;
    bop_process_summary: string;
    wot_batch_index: number;
    wot_lot_start: number;
    wot_lot_end: number;
    wot_lot_range: string;
    wot_batch_ratio: number;
    production_need_date: string;
    priority_focus: ManufacturingPriorityTier;
    items: any[];
  }

  const waveBucketsMap = new Map<string, ManufacturingWaveBucket>();

  // Helper to allocate a specific item quantity into a target manufacturing wave bucket
  const allocateItemToWaveBucket = (
    bucketMeta: Omit<ManufacturingWaveBucket, "items">,
    item: RawCandidateItem,
    allocInfo: ManufacturingProcessAllocation,
    allocQty: number,
    lotSplitLabel: string,
  ) => {
    const cleanQty = Number(Math.max(0.01, allocQty).toFixed(4));
    let bucket = waveBucketsMap.get(bucketMeta.stageKey);
    if (!bucket) {
      bucket = {
        ...bucketMeta,
        items: [],
      };
      waveBucketsMap.set(bucketMeta.stageKey, bucket);
    } else {
      if (bucketMeta.production_need_date < bucket.production_need_date) {
        bucket.production_need_date = bucketMeta.production_need_date;
      }
      if (
        priorityRank(bucketMeta.priority_focus) <
        priorityRank(bucket.priority_focus)
      ) {
        bucket.priority_focus = bucketMeta.priority_focus;
      }
    }

    const existing = bucket.items.find(
      (x) =>
        x.source_pr_item_id === item.source_pr_item_id &&
        x.bop_step_id === allocInfo.bop_step_id &&
        x.product_node_id === (allocInfo.product_node_id || null),
    );

    if (existing) {
      existing.allocated_wave_qty = Number(
        (existing.allocated_wave_qty + cleanQty).toFixed(4),
      );
      existing.subtotal_cost = Math.round(
        existing.allocated_wave_qty * item.unit_price,
      );
    } else {
      bucket.items.push({
        id: `PPI-SIM-${bucket.items.length + 1}-${Math.random().toString(36).substring(2, 6)}`,
        wave_number: 1,
        item_id: item.item_id,
        item_code: item.item_code,
        item_name: item.item_name,
        category: item.category,
        dimension: item.dimension,
        spec: item.spec,
        uom: item.uom,
        total_project_qty: item.qty,
        bom_required_qty: item.bom_required_qty,
        gross_bom_qty: item.gross_bom_qty ?? item.bom_required_qty,
        warehouse_free_qty: item.warehouse_free_qty ?? 0,
        project_allocated_qty: item.project_allocated_qty ?? 0,
        existing_pr_qty: item.existing_pr_qty ?? 0,
        net_shortage_qty: item.net_shortage_qty ?? item.qty,
        source_origin: item.source_origin ?? "PR_QUEUE",
        allocated_wave_qty: cleanQty,
        unit_price: item.unit_price,
        subtotal_cost: Math.round(cleanQty * item.unit_price),
        lead_time_days: item.lead_time_days,
        bom_id: item.bom_id,
        product_node_id: allocInfo.product_node_id || item.product_node_id || null,
        product_node_name: allocInfo.product_node_name || item.product_node_name || null,
        consuming_process_name:
          allocInfo.consuming_process_name ||
          item.consuming_process_name ||
          allocInfo.process_step_name,
        bop_step_id: allocInfo.bop_step_id,
        process_step_name: allocInfo.process_step_name,
        step_sequence: allocInfo.step_sequence,
        station_id: allocInfo.station_id,
        station_code: allocInfo.station_code,
        station_name: allocInfo.station_name,
        priority_tier: item.priority_tier,
        priority_score: item.priority_score,
        priority_reason: item.priority_reason,
        downstream_process_count: allocInfo.downstream_process_count,
        total_process_count: allocInfo.total_process_count,
        float_hours: allocInfo.float_wot_hours,
        is_priority_manual_override: false,
        is_critical_path: allocInfo.is_critical_path,
        process_allocation_fraction: item.process_allocation_fraction,
        station_need_date: bucketMeta.production_need_date,
        preferred_supplier_id: item.preferred_supplier_id,
        preferred_supplier_name: item.preferred_supplier_name,
        source_pr_id: item.source_pr_id,
        source_pr_number: item.source_pr_number,
        source_pr_item_id: String(item.source_pr_item_id || "").split("__")[0],
        expected_delivery_date: item.expected_delivery_date,
        lot_split_label: lotSplitLabel,
      });
    }
  };

  // Sort items by BOP Station Cluster -> Step Sequence -> Priority Tier -> Total Value
  const sortedItems = [...items].sort((a, b) => {
    if (a.station_cluster_seq !== b.station_cluster_seq) {
      return a.station_cluster_seq - b.station_cluster_seq;
    }
    if (a.step_sequence !== b.step_sequence) {
      return a.step_sequence - b.step_sequence;
    }
    if (priorityRank(a.priority_tier) !== priorityRank(b.priority_tier)) {
      return priorityRank(a.priority_tier) - priorityRank(b.priority_tier);
    }
    return b.qty * b.unit_price - a.qty * a.unit_price;
  });

  for (const item of sortedItems) {
    const totalItemQty = Number(item.qty);
    const isIntegerQty = Math.abs(totalItemQty - Math.round(totalItemQty)) < 1e-4;
    const processAllocs =
      item.process_allocations && item.process_allocations.length > 0
        ? item.process_allocations
        : [
            {
              bop_step_id: item.bop_step_id || "BOP-1",
              step_sequence: item.step_sequence || 1,
              process_step_name: item.process_step_name || "Manufacturing",
              product_node_id: item.product_node_id || null,
              product_node_name: item.product_node_name || null,
              consuming_process_name:
                item.consuming_process_name ||
                item.process_step_name ||
                "Manufacturing",
              station_id: item.station_id || "STN-01",
              station_code: item.station_code || "STN-01",
              station_name: item.station_name || "Station 1",
              station_cluster_seq: item.station_cluster_seq || 1,
              fraction: 1,
              is_critical_path: item.is_critical_path,
              is_root_step: item.is_root_step,
              dag_depth: 0,
              float_wot_hours: item.float_hours || 0,
              downstream_process_count: item.downstream_process_count || 1,
              total_process_count: item.total_process_count || 1,
              station_start_date: item.station_start_date,
              station_start_offset_days: item.station_start_offset_days,
            },
          ];

    let remainingForItem = totalItemQty;

    processAllocs.forEach((pAlloc, pIdx) => {
      const isLastProcessAlloc = pIdx === processAllocs.length - 1;
      const rawProcessQty = isLastProcessAlloc
        ? remainingForItem
        : isIntegerQty && totalItemQty >= processAllocs.length
          ? Math.max(1, Math.round(totalItemQty * pAlloc.fraction))
          : Number((totalItemQty * pAlloc.fraction).toFixed(4));

      const processStageQty = Math.min(
        remainingForItem,
        Math.max(0.01, rawProcessQty),
      );
      remainingForItem = Number((remainingForItem - processStageQty).toFixed(4));

      const effectiveBatchesForThisItem =
        strategyMode === "BOP_PROCESS_SEQUENCE" ||
        (isIntegerQty && processStageQty < wotBatchGroupsCount)
          ? 1
          : wotBatchGroupsCount;

      let remStageQty = processStageQty;

      for (let bIdx = 0; bIdx < effectiveBatchesForThisItem; bIdx++) {
        const isLastBatch = bIdx === effectiveBatchesForThisItem - 1;
        const wotLotStart =
          effectiveBatchesForThisItem === 1
            ? 1
            : bIdx * wotLotsPerWave + 1;
        const wotLotEnd =
          effectiveBatchesForThisItem === 1
            ? totalWotLots
            : Math.min(totalWotLots, (bIdx + 1) * wotLotsPerWave);
        const lotsInThisBatch = Math.max(1, wotLotEnd - wotLotStart + 1);
        const batchRatio =
          effectiveBatchesForThisItem === 1
            ? 1
            : lotsInThisBatch / totalWotLots;

        let batchQty = isLastBatch
          ? remStageQty
          : isIntegerQty
            ? Math.max(1, Math.round(processStageQty * batchRatio))
            : Number((processStageQty * batchRatio).toFixed(4));

        batchQty = Math.min(remStageQty, batchQty);
        if (batchQty <= 0.0001) continue;
        remStageQty = Number((remStageQty - batchQty).toFixed(4));

        const wotBatchOffsetDays = Math.round(
          (wotLotStart - 1) * masterSchedule.wot_cadence_days,
        );
        const prioritySubStage =
          item.priority_tier === "SUPPORTING" ? "SUPPORTING" : "PRIMARY";
        const supportingDelayDays =
          item.priority_tier === "SUPPORTING" &&
          masterSchedule.production_horizon_days >= 5
            ? 1
            : 0;

        const batchNeedDate = addDaysIso(
          pAlloc.station_start_date,
          wotBatchOffsetDays + supportingDelayDays,
        );

        // Group waves per BOP Product Card -> Consuming Process so M-A -> Process A and M-B -> Process B each get their own wave/timeline track
        const stepAndProductKey = `${pAlloc.bop_step_id}-${pAlloc.product_node_id || "DIRECT"}`;
        const stageKey =
          strategyMode === "WOT_BATCH_CADENCE"
            ? `WOT-BATCH-${bIdx + 1}-${stepAndProductKey}-${prioritySubStage}`
            : strategyMode === "BOP_PROCESS_SEQUENCE"
              ? `STN-${pAlloc.station_cluster_seq}-${stepAndProductKey}-${prioritySubStage}`
              : `STG-${pAlloc.station_cluster_seq}-${stepAndProductKey}-WOT-${bIdx + 1}-${prioritySubStage}`;

        const wotUnitsCovered = Math.min(
          masterSchedule.target_order_qty,
          lotsInThisBatch * masterSchedule.master_lot_size,
        );
        const wotLotRangeLabel =
          totalWotLots === 1
            ? `WOT Lot 1/1 (${masterSchedule.target_order_qty} pcs)`
            : wotLotStart === wotLotEnd
              ? `WOT Lot #${wotLotStart}/${totalWotLots} (${wotUnitsCovered} pcs)`
              : `WOT Lot #${wotLotStart}–#${wotLotEnd} of ${totalWotLots} (${wotUnitsCovered} pcs)`;

        const cardPct = Math.round((item.process_allocation_fraction || 1) * 100);
        const lotSplitLabel = pAlloc.product_node_name
          ? `Card ${pAlloc.product_node_name} (${cardPct}%) → ${pAlloc.consuming_process_name || pAlloc.process_step_name} · ${wotLotRangeLabel}`
          : `${pAlloc.station_code} · ${wotLotRangeLabel}`;

        allocateItemToWaveBucket(
          {
            stageKey,
            station_id: pAlloc.station_id,
            station_code: pAlloc.station_code,
            station_name: pAlloc.station_name,
            station_cluster_seq: pAlloc.station_cluster_seq,
            bop_process_summary: pAlloc.process_step_name,
            wot_batch_index: bIdx + 1,
            wot_lot_start: wotLotStart,
            wot_lot_end: wotLotEnd,
            wot_lot_range: wotLotRangeLabel,
            wot_batch_ratio: Number(batchRatio.toFixed(4)),
            production_need_date: batchNeedDate,
            priority_focus: item.priority_tier,
          },
          item,
          pAlloc,
          batchQty,
          lotSplitLabel,
        );
      }
    });
  }

  // Sort buckets chronologically by Production Need Date -> Station Cluster Seq -> Priority Focus -> WOT Batch Index
  const sortedBuckets = Array.from(waveBucketsMap.values())
    .filter((b) => b.items.length > 0)
    .sort((a, b) => {
      if (a.production_need_date !== b.production_need_date) {
        return a.production_need_date.localeCompare(b.production_need_date);
      }
      if (a.station_cluster_seq !== b.station_cluster_seq) {
        return a.station_cluster_seq - b.station_cluster_seq;
      }
      if (priorityRank(a.priority_focus) !== priorityRank(b.priority_focus)) {
        return priorityRank(a.priority_focus) - priorityRank(b.priority_focus);
      }
      return a.wot_batch_index - b.wot_batch_index;
    });

  // If project has no items allocated yet, generate baseline wave stages across the project timeline
  if (sortedBuckets.length === 0) {
    const horizonDays = Math.max(7, masterSchedule.production_horizon_days || 30);
    const stage1Days = Math.max(1, Math.round(horizonDays * 0.15));
    const stage2Days = Math.max(stage1Days + 2, Math.round(horizonDays * 0.45));
    const stage3Days = Math.max(stage2Days + 2, Math.round(horizonDays * 0.75));

    const defaultStages = [
      {
        station_id: "STN-PREP",
        station_code: "STN-01",
        station_name: "Material Preparation & Cutting",
        process_name: "Raw Material Inbound & Cutting",
        need_date: addDaysIso(masterSchedule.master_start_date, stage1Days),
        priority: "CRITICAL_MAIN" as ManufacturingPriorityTier,
      },
      {
        station_id: "STN-FAB",
        station_code: "STN-02",
        station_name: "Machining & Component Fabrication",
        process_name: "CNC Machining & Component Assembly",
        need_date: addDaysIso(masterSchedule.master_start_date, stage2Days),
        priority: "CORE_PROCESS" as ManufacturingPriorityTier,
      },
      {
        station_id: "STN-ASY",
        station_code: "STN-03",
        station_name: "Assembly, Finishing & Quality Control",
        process_name: "Final Assembly & QC Inspection",
        need_date: addDaysIso(masterSchedule.master_start_date, stage3Days),
        priority: "SUPPORTING" as ManufacturingPriorityTier,
      },
    ];

    defaultStages.forEach((st, idx) => {
      sortedBuckets.push({
        stageKey: `BASE-STAGE-${idx + 1}`,
        station_id: st.station_id,
        station_code: st.station_code,
        station_name: st.station_name,
        station_cluster_seq: idx + 1,
        bop_process_summary: st.process_name,
        wot_batch_index: idx + 1,
        wot_lot_start: 1,
        wot_lot_end: totalWotLots,
        wot_lot_range: `WOT Batch ${idx + 1}/${Math.min(3, totalWotLots)}`,
        wot_batch_ratio: 1,
        production_need_date: st.need_date,
        priority_focus: st.priority,
        items: [],
      });
    });
  }

  const todayIso = new Date().toISOString().split("T")[0];
  const clusterByStationId = new Map(
    stationClusters.map((c) => [c.station_id, c]),
  );

  const finalizedWaves = sortedBuckets.map((bucket, idx) => {
    const seqNum = idx + 1;

    // Sort items inside each wave by priority_tier then step_sequence
    bucket.items.sort((a, b) => {
      if (priorityRank(a.priority_tier) !== priorityRank(b.priority_tier)) {
        return priorityRank(a.priority_tier) - priorityRank(b.priority_tier);
      }
      return (a.step_sequence || 1) - (b.step_sequence || 1);
    });

    const waveQty = Number(
      bucket.items
        .reduce((sum, it) => sum + Number(it.allocated_wave_qty || 0), 0)
        .toFixed(4),
    );
    const waveCost = Math.round(
      bucket.items.reduce((sum, it) => sum + Number(it.subtotal_cost || 0), 0),
    );
    const maxLeadTime = bucket.items.reduce(
      (maxLt, it) => Math.max(maxLt, Number(it.lead_time_days || 4)),
      4,
    );

    const prodNeedDate = bucket.production_need_date;
    // Target Arrival Date = Station Start Date in Setup Master minus Safety Buffer
    const arrivalDate = addDaysIso(prodNeedDate, -bufferDays);
    // Target Order Release Date = Target Arrival Date minus Max Supplier Lead Time
    const orderDate = addDaysIso(arrivalDate, -maxLeadTime);

    // Feasible timeline if ordered on max(orderDate, todayIso)
    const feasibleOrderDate = orderDate < todayIso ? todayIso : orderDate;
    const feasibleArrivalDate = addDaysIso(feasibleOrderDate, maxLeadTime);

    const stCluster = clusterByStationId.get(bucket.station_id);
    const lotsInWave = Math.max(
      1,
      (bucket.wot_lot_end || 1) - (bucket.wot_lot_start || 1) + 1,
    );
    const processDurationDays = Math.max(
      1,
      Math.ceil(
        ((stCluster?.wot_hours || 6) * lotsInWave) /
          Math.max(1, masterSchedule.shift_hours),
      ),
    );
    const processEndDate = addDaysIso(prodNeedDate, processDurationDays);

    const plannedSlackDays = daysBetweenIso(arrivalDate, prodNeedDate);
    const feasibleSlackDays = daysBetweenIso(feasibleArrivalDate, prodNeedDate);
    const bottleneckDelayDays = Math.max(
      0,
      -feasibleSlackDays,
      -plannedSlackDays,
    );
    const isBottleneck =
      feasibleArrivalDate > prodNeedDate || arrivalDate > prodNeedDate;
    const bottleneckSeverity: "CRITICAL" | "WARNING" | "OPTIMAL" = isBottleneck
      ? "CRITICAL"
      : orderDate < todayIso || feasibleSlackDays < bufferDays
        ? "WARNING"
        : "OPTIMAL";

    const prevWave = idx > 0 ? sortedBuckets[idx - 1] : null;
    const intervalFromPrevDays = prevWave
      ? Math.max(
          0,
          daysBetweenIso(prevWave.production_need_date, prodNeedDate),
        )
      : 0;

    const uniqueProcesses = Array.from(
      new Set(bucket.items.map((it) => it.process_step_name).filter(Boolean)),
    );
    const uniqueStations = Array.from(
      new Set(
        bucket.items
          .map((it) =>
            it.station_code && it.station_name
              ? `${it.station_code} (${it.station_name})`
              : it.station_name || it.process_step_name,
          )
          .filter(Boolean),
      ),
    );

    const stationFocus =
      uniqueStations.length > 0
        ? uniqueStations.slice(0, 2).join(" → ")
        : `${bucket.station_code} — ${bucket.station_name}`;
    const processSummary =
      uniqueProcesses.length > 0
        ? uniqueProcesses.slice(0, 3).join(" · ")
        : bucket.bop_process_summary;

    const bottleneckReason =
      bottleneckSeverity === "CRITICAL"
        ? `Supply Bottleneck: Material arrives ${feasibleArrivalDate} (${bottleneckDelayDays}d AFTER ${processSummary} starts on ${prodNeedDate} due to ${maxLeadTime}d vendor lead time)`
        : bottleneckSeverity === "WARNING"
          ? `Buffer Compressed: Order release (${orderDate}) is past due. Remaining buffer before ${processSummary} (${prodNeedDate}) is ${Math.max(0, feasibleSlackDays)}d (target ${bufferDays}d)`
          : `Optimal Sync: Planned arrival (${arrivalDate}) provides ${plannedSlackDays}d safety buffer before ${processSummary} start (${prodNeedDate})`;

    const criticalCount = bucket.items.filter(
      (it) => it.priority_tier === "CRITICAL_MAIN",
    ).length;
    const coreCount = bucket.items.filter(
      (it) => it.priority_tier === "CORE_PROCESS",
    ).length;
    const supportingCount = bucket.items.filter(
      (it) => it.priority_tier === "SUPPORTING",
    ).length;

    const dominantPriority: ManufacturingPriorityTier =
      criticalCount > 0
        ? "CRITICAL_MAIN"
        : coreCount > 0
          ? "CORE_PROCESS"
          : "SUPPORTING";

    const priorityLabel =
      dominantPriority === "CRITICAL_MAIN"
        ? "Critical"
        : dominantPriority === "CORE_PROCESS"
          ? "Core Process"
          : "Supporting";

    return {
      wave_number: seqNum,
      wave_name: `Wave ${seqNum} — ${stationFocus} (${priorityLabel})`,
      station_focus: stationFocus,
      station_id: bucket.station_id,
      station_code: bucket.station_code,
      bop_process_summary: processSummary,
      wot_lot_range: bucket.wot_lot_range,
      wot_batch_ratio: bucket.wot_batch_ratio,
      priority_focus: dominantPriority,
      critical_items_count: criticalCount,
      core_items_count: coreCount,
      supporting_items_count: supportingCount,
      max_lead_time_days: maxLeadTime,
      interval_from_prev_days: intervalFromPrevDays,
      target_order_date: orderDate,
      target_arrival_date: arrivalDate,
      production_need_date: prodNeedDate,
      feasible_order_date: feasibleOrderDate,
      feasible_arrival_date: feasibleArrivalDate,
      process_start_date: prodNeedDate,
      process_end_date: processEndDate,
      process_duration_days: processDurationDays,
      planned_slack_days: plannedSlackDays,
      feasible_slack_days: feasibleSlackDays,
      bottleneck_delay_days: bottleneckDelayDays,
      is_bottleneck: isBottleneck,
      bottleneck_severity: bottleneckSeverity,
      bottleneck_reason: bottleneckReason,
      is_expedite_required: orderDate < todayIso,
      estimated_cost: waveCost,
      total_qty_units: waveQty,
      status: "PLANNED",
      items: bucket.items.map((it) => {
        const itemArrival = arrivalDate;
        const itemFeasibleArrival = addDaysIso(
          orderDate < todayIso ? todayIso : orderDate,
          Number(it.lead_time_days || 4),
        );
        const itemNeedDate = it.station_need_date || prodNeedDate;
        const itemDelay = Math.max(
          0,
          daysBetweenIso(itemNeedDate, itemFeasibleArrival),
        );
        return {
          ...it,
          id: `PPI-SIM-${seqNum}-${it.source_pr_item_id || it.item_id}-${it.bop_step_id || "STEP"}`,
          wave_number: seqNum,
          planned_delivery_date: itemArrival,
          feasible_arrival_date: itemFeasibleArrival,
          bottleneck_delay_days: itemDelay,
          is_bottleneck: itemFeasibleArrival > itemNeedDate,
        };
      }),
    };
  });

  const avgIntervalDays =
    finalizedWaves.length <= 1
      ? 0
      : Math.max(
          1,
          Math.round(
            finalizedWaves
              .slice(1)
              .reduce((s, w) => s + Number(w.interval_from_prev_days || 0), 0) /
              Math.max(1, finalizedWaves.length - 1),
          ),
        );

  const totalCriticalItems = items.filter(
    (it) => it.priority_tier === "CRITICAL_MAIN",
  ).length;
  const totalCoreItems = items.filter(
    (it) => it.priority_tier === "CORE_PROCESS",
  ).length;
  const totalSupportingItems = items.filter(
    (it) => it.priority_tier === "SUPPORTING",
  ).length;

  const allTimelineDates = [
    todayIso,
    masterSchedule.master_start_date,
    masterSchedule.master_end_date,
    ...finalizedWaves.flatMap((w) => [
      w.target_order_date,
      w.target_arrival_date,
      w.feasible_arrival_date,
      w.production_need_date,
      w.process_end_date,
    ]),
  ].filter(Boolean) as string[];
  allTimelineDates.sort();

  const maxBottleneckDelayDays = finalizedWaves.reduce(
    (m, w) => Math.max(m, Number(w.bottleneck_delay_days || 0)),
    0,
  );

  const ganttCorrelation = {
    timeline_start_date: allTimelineDates[0] || todayIso,
    timeline_end_date:
      allTimelineDates[allTimelineDates.length - 1] ||
      masterSchedule.master_end_date,
    today_date: todayIso,
    master_start_date: masterSchedule.master_start_date,
    master_end_date: masterSchedule.master_end_date,
    total_bottleneck_waves: finalizedWaves.filter(
      (w) => w.bottleneck_severity === "CRITICAL",
    ).length,
    total_warning_waves: finalizedWaves.filter(
      (w) => w.bottleneck_severity === "WARNING",
    ).length,
    total_optimal_waves: finalizedWaves.filter(
      (w) => w.bottleneck_severity === "OPTIMAL",
    ).length,
    max_bottleneck_delay_days: maxBottleneckDelayDays,
    recommended_project_start_date:
      maxBottleneckDelayDays > 0
        ? addDaysIso(masterSchedule.master_start_date, maxBottleneckDelayDays)
        : masterSchedule.master_start_date,
    bop_step_schedules: stepSchedules,
  };

  return {
    project_id: project.id || params.project_id,
    project_name: project.name || params.project_id,
    spk_number: project.resolved_spk_number || project.spk_number || null,
    is_master_set: Boolean(project.is_master_set),
    bop_status: project.bop_status || "PENDING",
    master_start_date: masterSchedule.master_start_date,
    master_end_date: masterSchedule.master_end_date,
    wo_start_date: masterSchedule.master_start_date,
    wo_end_date: masterSchedule.master_end_date,
    target_order_qty: masterSchedule.target_order_qty,
    master_lot_size: masterSchedule.master_lot_size,
    total_wot_lots: masterSchedule.total_wot_lots,
    wot_lots_per_wave: wotLotsPerWave,
    shift_hours: masterSchedule.shift_hours,
    factory_factor: masterSchedule.factory_factor,
    wot_cadence_days: masterSchedule.wot_cadence_days,
    production_horizon_days: masterSchedule.production_horizon_days,
    bop_steps_count: bopSteps.length,
    station_clusters_count: stationClusters.length,
    station_clusters: stationClusters,
    mrp_summary: mrpSummary,
    gantt_correlation: ganttCorrelation,
    source_type: mrpSummary.source_mode,
    strategy_mode: strategyMode,
    total_waves: finalizedWaves.length,
    wave_interval_days: avgIntervalDays,
    lead_time_buffer_days: bufferDays,
    total_items_count: sortedItems.length,
    critical_items_count: totalCriticalItems,
    core_items_count: totalCoreItems,
    supporting_items_count: totalSupportingItems,
    total_lot_qty: totalLotQty,
    total_estimated_budget: totalEstimatedBudget,
    waves: finalizedWaves,
  };
}

export function registerProcurementPlanRoutes(purchasingRouter: Router) {
  ensureProcurementPlanSchema();

  // 1. Get Candidate Projects from BOM MRP Netting + Open PR Queue + Setup Master & BOP Context
  purchasingRouter.get(
    "/api/purchasing/procurement-plans/candidates",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (_req, res) => {
      try {
        ensureProcurementPlanSchema();

        // Collect all active manufacturing projects with BOMs, BOPs, or open PRs
        const activeProjects = db
          .prepare(
            `SELECT DISTINCT
               p.id as project_id,
               p.name as project_name,
               COALESCE(p.spk_number, s.spk_number) as spk_number,
               p.start_date as wo_start_date,
               COALESCE(NULLIF(p.planned_completion_date, ''), NULLIF(p.due_date, '2099-12-31'), s.target_completion_date, s.due_date) as wo_end_date,
               COALESCE(p.is_master_set, 0) as is_master_set,
               COALESCE(p.qty, 50) as target_order_qty,
               COALESCE(p.lot_size, 10) as master_lot_size,
               COALESCE(p.shift_hours, 8) as shift_hours,
               COALESCE(p.factory_factor, 85) as factory_factor,
               p.bop_status as bop_status,
               p.status as project_status
             FROM projects p
             LEFT JOIN spks s ON s.project_id = p.id OR s.spk_number = p.spk_number
             WHERE COALESCE(p.status, 'ACTIVE') NOT IN ('FINISHED', 'COMPLETED', 'CLOSED', 'CANCELLED', 'ARCHIVED', 'INTERNAL_OVERHEAD')
               AND p.id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
               AND UPPER(COALESCE(p.name, '')) NOT LIKE '%CONSUMABLE%'
               AND UPPER(COALESCE(p.name, '')) NOT LIKE '%TRANSPORTATION%'
               AND UPPER(COALESCE(p.name, '')) NOT LIKE '%OTHER PROCUREMENT%'
               AND UPPER(COALESCE(p.name, '')) NOT LIKE '%OTHERS PROCUREMENT%'
               AND UPPER(COALESCE(p.name, '')) NOT LIKE '%GENERAL PROCUREMENT%'
             ORDER BY p.created_at DESC`,
          )
          .all() as any[];

        const existingPlansByProject = new Map<string, any>();
        const savedPlans = db
          .prepare(
            "SELECT id, plan_code, project_id, status, total_waves FROM procurement_plans WHERE status != 'ARCHIVED'",
          )
          .all() as any[];
        savedPlans.forEach((sp) => {
          existingPlansByProject.set(sp.project_id, sp);
        });

        const prCandidates: any[] = [];

        for (const row of activeProjects) {
          const ctx = resolveProjectManufacturingContext(row.project_id);

          const openPrDocs = db
            .prepare(
              `SELECT COUNT(DISTINCT pr.id) as pr_doc_count, GROUP_CONCAT(DISTINCT pr.pr_number) as pr_numbers
               FROM pr_items pri
               JOIN purchase_requests pr ON pri.pr_id = pr.id
               WHERE COALESCE(pr.project_id, 'GENERAL') = ?
                 AND pri.po_id IS NULL
                 AND COALESCE(pr.archived, 0) = 0
                 AND pr.status NOT IN ('CANCELLED', 'REVISION')`,
            )
            .get(row.project_id) as any;

          const totalQty = Number(
            ctx.items.reduce((s, it) => s + Number(it.qty || 0), 0).toFixed(2),
          );
          const totalBudget = Math.round(
            ctx.items.reduce(
              (s, it) => s + Number(it.qty || 0) * Number(it.unit_price || 0),
              0,
            ),
          );

          const stationNames = ctx.stationClusters
            .map((c) => `${c.station_code} (${c.process_names[0] || c.station_name})`)
            .filter(Boolean);

          prCandidates.push({
            project_id: row.project_id,
            project_name: row.project_name,
            spk_number: row.spk_number || null,
            is_master_set: Boolean(row.is_master_set),
            bop_status: row.bop_status || null,
            wo_start_date: ctx.masterSchedule.master_start_date || null,
            wo_end_date: ctx.masterSchedule.master_end_date || null,
            target_order_qty: ctx.masterSchedule.target_order_qty,
            master_lot_size: ctx.masterSchedule.master_lot_size,
            total_wot_lots: ctx.masterSchedule.total_wot_lots,
            shift_hours: ctx.masterSchedule.shift_hours,
            factory_factor: ctx.masterSchedule.factory_factor,
            wo_bop_steps_count: ctx.bopSteps.length,
            wo_stations_summary:
              stationNames.length > 0
                ? stationNames.slice(0, 3).join(" → ")
                : null,
            source_type: ctx.mrpSummary.source_mode,
            mrp_summary: ctx.mrpSummary,
            pending_item_count: ctx.items.length,
            pr_doc_count: Number(openPrDocs?.pr_doc_count || 0),
            pr_numbers: openPrDocs?.pr_numbers
              ? String(openPrDocs.pr_numbers).split(",")
              : [],
            total_lot_qty: totalQty,
            total_estimated_budget: totalBudget,
            is_high_volume_recommended:
              ctx.masterSchedule.total_wot_lots > 1 || ctx.bopSteps.length > 1,
            existing_plan: existingPlansByProject.get(row.project_id) || null,
          });
        }

        res.json({
          pr_candidates: prCandidates,
        });
      } catch (error: any) {
        console.error("Failed to fetch procurement plan candidates:", error);
        res.status(500).json({
          error: "Failed to fetch procurement plan candidates",
          details: error.message,
        });
      }
    },
  );

  // 2. List all active Saved Procurement Plans
  purchasingRouter.get(
    "/api/purchasing/procurement-plans",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (_req, res) => {
      try {
        ensureProcurementPlanSchema();
        const plans = db
          .prepare(
            `SELECT
               pp.*,
               p.start_date as wo_start_date,
               COALESCE(NULLIF(p.planned_completion_date, ''), NULLIF(p.due_date, '2099-12-31')) as wo_end_date,
               COALESCE(p.is_master_set, 0) as is_master_set,
               COALESCE(p.qty, 50) as target_order_qty,
               COALESCE(p.lot_size, pp.master_lot_size, 10) as resolved_lot_size,
               COALESCE(p.shift_hours, pp.shift_hours, 8) as resolved_shift_hours,
               COALESCE(p.factory_factor, pp.factory_factor, 85) as resolved_factory_factor,
               p.bop_status as bop_status,
               (SELECT COUNT(*) FROM bill_of_processes bop WHERE bop.project_id = pp.project_id OR bop.project_id = pp.spk_number) as wo_bop_steps_count
             FROM procurement_plans pp
             LEFT JOIN projects p ON pp.project_id = p.id
             WHERE pp.status != 'ARCHIVED'
             ORDER BY pp.created_at DESC`,
          )
          .all() as any[];

        const todayIso = new Date().toISOString().split("T")[0];

        const enriched = plans.map((plan) => {
          const initialWaves = db
            .prepare(
              `SELECT id, status FROM procurement_plan_waves WHERE plan_id = ?`,
            )
            .all(plan.id) as { id: string; status: string }[];
          for (const iw of initialWaves) {
            if (iw.status !== "PLANNED") {
              reconcileWaveAndPlanLifecycleByWaveId(iw.id);
            }
          }

          const refreshedPlan = db
            .prepare("SELECT status FROM procurement_plans WHERE id = ?")
            .get(plan.id) as { status: string } | undefined;
          if (refreshedPlan?.status) {
            plan.status = refreshedPlan.status;
          }

          const waves = db
            .prepare(
              `SELECT * FROM procurement_plan_waves
               WHERE plan_id = ?
               ORDER BY wave_number ASC`,
            )
            .all(plan.id) as any[];

          const items = db
            .prepare(
              `SELECT * FROM procurement_plan_items
               WHERE plan_id = ?
               ORDER BY wave_number ASC, step_sequence ASC`,
            )
            .all(plan.id) as any[];

          const ctx = resolveProjectManufacturingContext(plan.project_id);
          const clusterByStationId = new Map(
            ctx.stationClusters.map((c) => [c.station_id, c]),
          );
          const bufferDays = Math.max(
            1,
            Number(plan.lead_time_buffer_days || 3),
          );

          // Build lookup from consumer PROCESS step or PRODUCT step to its feeding PRODUCT card
          const productCardByStepId = new Map<
            string,
            {
              product_node_id: string;
              product_node_name: string;
              consuming_process_name: string;
              formatted_step_name: string;
            }
          >();
          for (const s of ctx.bopSteps) {
            if (String(s.node_type || "PROCESS").toUpperCase() !== "PRODUCT") {
              continue;
            }
            const prodId = String(s.id || "");
            const prodName = String(s.process_name || "Material Card");
            const consumer = ctx.bopSteps.find((cand) => {
              if (
                String(cand.node_type || "PROCESS").toUpperCase() === "PRODUCT"
              ) {
                return false;
              }
              let preds: string[] = [];
              try {
                preds = Array.isArray(cand.predecessor_ids)
                  ? cand.predecessor_ids.map(String)
                  : JSON.parse(cand.predecessor_ids || "[]").map(String);
              } catch (_e) {
                preds = [];
              }
              return preds.includes(prodId) || preds.includes(prodName);
            });
            const consumerName = String(
              consumer?.process_name || prodName,
            );
            const info = {
              product_node_id: prodId,
              product_node_name: prodName,
              consuming_process_name: consumerName,
              formatted_step_name: consumer
                ? `[${prodName}] → ${consumerName}`
                : prodName,
            };
            productCardByStepId.set(prodId, info);
            if (consumer?.id) {
              productCardByStepId.set(String(consumer.id), info);
            }
          }

          const wavesWithItems = waves.map((w, wIdx) => {
            let parsedPos: {
              po_id: string;
              po_number: string;
              supplier_name: string;
              status?: string;
            }[] = [];
            if (w.generated_pos_json) {
              try {
                parsedPos = JSON.parse(w.generated_pos_json);
              } catch (_e) {
                parsedPos = [];
              }
            } else if (w.generated_po_id && w.generated_po_number) {
              parsedPos = [
                {
                  po_id: w.generated_po_id,
                  po_number: w.generated_po_number,
                  supplier_name: "Supplier",
                },
              ];
            }

            const waveItems = items
              .filter((it) => it.wave_id === w.id)
              .map((it) => {
                const normPriority = normalizePriorityTier(it.priority_tier);
                const fallbackScore =
                  normPriority === "CRITICAL_MAIN"
                    ? 88
                    : normPriority === "CORE_PROCESS"
                      ? 55
                      : 26;
                const score = Number(it.priority_score || fallbackScore);
                const isCrit = Boolean(it.is_critical_path);
                const downCount = Number(it.downstream_process_count || 1);
                const totCount = Number(it.total_process_count || 1);
                const fallbackReason = `${isCrit ? "CPM" : `Float ${Number(it.float_hours || 0)}h`} · Blocks ${downCount}/${totCount} steps`;
                const matchedProdCard = it.bop_step_id
                  ? productCardByStepId.get(String(it.bop_step_id))
                  : undefined;
                const resolvedProcessStepName =
                  matchedProdCard?.formatted_step_name ||
                  it.process_step_name ||
                  "Manufacturing";
                return {
                  ...it,
                  process_step_name: resolvedProcessStepName,
                  product_node_id:
                    it.product_node_id || matchedProdCard?.product_node_id || null,
                  product_node_name:
                    it.product_node_name ||
                    matchedProdCard?.product_node_name ||
                    null,
                  consuming_process_name:
                    it.consuming_process_name ||
                    matchedProdCard?.consuming_process_name ||
                    it.process_step_name ||
                    null,
                  priority_tier: normPriority,
                  priority_score: score,
                  priority_reason: it.priority_reason || fallbackReason,
                  downstream_process_count: downCount,
                  total_process_count: totCount,
                  float_hours: Number(it.float_hours || 0),
                  is_priority_manual_override: false,
                  is_critical_path: isCrit,
                };
              });

            const maxLeadTime = waveItems.reduce(
              (m, it) => Math.max(m, Number(it.lead_time_days || 4)),
              4,
            );
            const prevWave = wIdx > 0 ? waves[wIdx - 1] : null;
            const intervalFromPrev = prevWave
              ? Math.max(
                  0,
                  daysBetweenIso(
                    prevWave.production_need_date,
                    w.production_need_date,
                  ),
                )
              : 0;

            const orderDate = w.target_order_date || todayIso;
            const arrivalDate = w.target_arrival_date || todayIso;
            const prodNeedDate = w.production_need_date || arrivalDate;
            const feasibleOrderDate =
              w.status === "PLANNED" && orderDate < todayIso
                ? todayIso
                : orderDate;
            const feasibleArrivalDate =
              w.status === "GRN_RECEIVED"
                ? arrivalDate
                : addDaysIso(feasibleOrderDate, maxLeadTime);

            const stCluster = clusterByStationId.get(w.station_id);
            const processDurationDays = Math.max(
              1,
              Math.ceil(
                ((stCluster?.wot_hours || 6) *
                  Math.max(1, Number(plan.wot_lots_per_wave || 1))) /
                  Math.max(1, Number(plan.resolved_shift_hours || 8)),
              ),
            );
            const processEndDate = addDaysIso(
              prodNeedDate,
              processDurationDays,
            );
            const plannedSlackDays = daysBetweenIso(arrivalDate, prodNeedDate);
            const feasibleSlackDays = daysBetweenIso(
              feasibleArrivalDate,
              prodNeedDate,
            );
            const bottleneckDelayDays =
              w.status === "GRN_RECEIVED"
                ? 0
                : Math.max(0, -feasibleSlackDays, -plannedSlackDays);
            const isBottleneck =
              w.status !== "GRN_RECEIVED" &&
              (feasibleArrivalDate > prodNeedDate ||
                arrivalDate > prodNeedDate);
            const bottleneckSeverity: "CRITICAL" | "WARNING" | "OPTIMAL" =
              isBottleneck
                ? "CRITICAL"
                : w.status === "PLANNED" &&
                    (orderDate < todayIso || feasibleSlackDays < bufferDays)
                  ? "WARNING"
                  : "OPTIMAL";

            const resolvedWaveProcesses = Array.from(
              new Set(
                waveItems
                  .map((it) => it.process_step_name)
                  .filter(Boolean),
              ),
            );
            const processSummary =
              resolvedWaveProcesses.length > 0
                ? resolvedWaveProcesses.slice(0, 3).join(" · ")
                : w.bop_process_summary || w.station_focus || "Process Stage";
            const bottleneckReason =
              bottleneckSeverity === "CRITICAL"
                ? `Supply Bottleneck: Material arrives ${feasibleArrivalDate} (${bottleneckDelayDays}d AFTER ${processSummary} starts on ${prodNeedDate} due to ${maxLeadTime}d vendor lead time)`
                : bottleneckSeverity === "WARNING"
                  ? `Buffer Compressed: Order release (${orderDate}) is past due. Remaining buffer before ${processSummary} (${prodNeedDate}) is ${Math.max(0, feasibleSlackDays)}d (target ${bufferDays}d)`
                  : `Optimal Sync: Planned arrival (${arrivalDate}) provides ${plannedSlackDays}d safety buffer before ${processSummary} start (${prodNeedDate})`;

            const criticalCount = waveItems.filter(
              (it) => it.priority_tier === "CRITICAL_MAIN",
            ).length;
            const coreCount = waveItems.filter(
              (it) => it.priority_tier === "CORE_PROCESS",
            ).length;
            const supportingCount = waveItems.filter(
              (it) => it.priority_tier === "SUPPORTING",
            ).length;

            return {
              ...w,
              bop_process_summary: processSummary,
              priority_focus: normalizePriorityTier(w.priority_focus),
              critical_items_count: criticalCount,
              core_items_count: coreCount,
              supporting_items_count: supportingCount,
              max_lead_time_days: maxLeadTime,
              interval_from_prev_days: intervalFromPrev,
              feasible_order_date: feasibleOrderDate,
              feasible_arrival_date: feasibleArrivalDate,
              process_start_date: prodNeedDate,
              process_end_date: processEndDate,
              process_duration_days: processDurationDays,
              planned_slack_days: plannedSlackDays,
              feasible_slack_days: feasibleSlackDays,
              bottleneck_delay_days: bottleneckDelayDays,
              is_bottleneck: isBottleneck,
              bottleneck_severity: bottleneckSeverity,
              bottleneck_reason: bottleneckReason,
              is_expedite_required:
                w.status === "PLANNED" && w.target_order_date < todayIso,
              generated_pos: parsedPos,
              items: waveItems,
            };
          });

          const executedCount = waves.filter(
            (w) => w.status !== "PLANNED",
          ).length;

          const wave1 = wavesWithItems[0] || null;
          const isHorizonDrifted = Boolean(
            plan.wo_start_date &&
              wave1 &&
              wave1.status === "PLANNED" &&
              String(wave1.production_need_date).slice(0, 10) !==
                String(plan.wo_start_date).slice(0, 10),
          );

          const totalOrderQty = Math.max(1, Number(plan.target_order_qty || 50));
          const resolvedLotSize = Math.max(
            1,
            Number(plan.resolved_lot_size || plan.master_lot_size || 10),
          );
          const totalWotLots = Math.max(
            1,
            Math.ceil(totalOrderQty / resolvedLotSize),
          );

          const allTimelineDates = [
            todayIso,
            ctx.masterSchedule.master_start_date,
            ctx.masterSchedule.master_end_date,
            ...wavesWithItems.flatMap((w) => [
              w.target_order_date,
              w.target_arrival_date,
              w.feasible_arrival_date,
              w.production_need_date,
              w.process_end_date,
            ]),
          ].filter(Boolean) as string[];
          allTimelineDates.sort();

          const maxBottleneckDelayDays = wavesWithItems.reduce(
            (m, w) => Math.max(m, Number(w.bottleneck_delay_days || 0)),
            0,
          );

          return {
            ...plan,
            strategy_mode: normalizeStrategyMode(plan.strategy_mode),
            master_lot_size: resolvedLotSize,
            total_wot_lots: totalWotLots,
            shift_hours: Number(plan.resolved_shift_hours || 8),
            factory_factor: Number(plan.resolved_factory_factor || 85),
            is_master_set: Boolean(plan.is_master_set),
            is_horizon_drifted: isHorizonDrifted,
            executed_waves_count: executedCount,
            mrp_summary: ctx.mrpSummary,
            gantt_correlation: {
              timeline_start_date: allTimelineDates[0] || todayIso,
              timeline_end_date:
                allTimelineDates[allTimelineDates.length - 1] ||
                ctx.masterSchedule.master_end_date,
              today_date: todayIso,
              master_start_date: ctx.masterSchedule.master_start_date,
              master_end_date: ctx.masterSchedule.master_end_date,
              total_bottleneck_waves: wavesWithItems.filter(
                (w) => w.bottleneck_severity === "CRITICAL",
              ).length,
              total_warning_waves: wavesWithItems.filter(
                (w) => w.bottleneck_severity === "WARNING",
              ).length,
              total_optimal_waves: wavesWithItems.filter(
                (w) => w.bottleneck_severity === "OPTIMAL",
              ).length,
              max_bottleneck_delay_days: maxBottleneckDelayDays,
              recommended_project_start_date:
                maxBottleneckDelayDays > 0
                  ? addDaysIso(
                      ctx.masterSchedule.master_start_date,
                      maxBottleneckDelayDays,
                    )
                  : ctx.masterSchedule.master_start_date,
              bop_step_schedules: ctx.stepSchedules,
            },
            critical_items_count: items.filter(
              (it) => normalizePriorityTier(it.priority_tier) === "CRITICAL_MAIN",
            ).length,
            core_items_count: items.filter(
              (it) => normalizePriorityTier(it.priority_tier) === "CORE_PROCESS",
            ).length,
            supporting_items_count: items.filter(
              (it) => normalizePriorityTier(it.priority_tier) === "SUPPORTING",
            ).length,
            ...(() => {
              // 1. Resolve Single Master Project PR & Wave-Split PR Lines
              const candidateMasterPrId =
                plan.master_pr_id ||
                wavesWithItems.find((w) => w.generated_pr_id)?.generated_pr_id ||
                items.find(
                  (it) =>
                    it.source_pr_id &&
                    !String(it.source_pr_id).startsWith("BOM-MRP-"),
                )?.source_pr_id ||
                null;

              let masterPrRow: any = null;
              if (candidateMasterPrId) {
                masterPrRow = db
                  .prepare(
                    `SELECT id, pr_number, title, requester_name, department, status, notes, created_at
                     FROM purchase_requests
                     WHERE id = ? AND status != 'CANCELLED' AND COALESCE(archived, 0) = 0`,
                  )
                  .get(candidateMasterPrId) as any;
              }
              if (!masterPrRow && plan.project_id) {
                masterPrRow = db
                  .prepare(
                    `SELECT id, pr_number, title, requester_name, department, status, notes, created_at
                     FROM purchase_requests
                     WHERE project_id = ? AND status != 'CANCELLED' AND COALESCE(archived, 0) = 0
                     ORDER BY created_at DESC LIMIT 1`,
                  )
                  .get(plan.project_id) as any;
              }

              const syncedWavesCount = wavesWithItems.filter(
                (w) =>
                  Boolean(w.generated_pr_id) ||
                  [
                    "PR_DRAFTED",
                    "PR_AUTHORIZED",
                    "PO_DRAFTED",
                    "PO_ISSUED",
                    "GRN_PARTIAL",
                    "GRN_RECEIVED",
                  ].includes(String(w.status || "").toUpperCase()),
              ).length;

              const prLines = wavesWithItems.flatMap((w) =>
                (w.items || []).map((it: any) => {
                  let prItemRow: any = null;
                  if (
                    it.source_pr_item_id &&
                    !String(it.source_pr_item_id).startsWith("BOM-MRP-")
                  ) {
                    prItemRow = db
                      .prepare(
                        `SELECT pri.*, po.po_number as linked_po_number, po.status as linked_po_status
                         FROM pr_items pri
                         LEFT JOIN purchase_orders po ON pri.po_id = po.id
                         WHERE pri.id = ?`,
                      )
                      .get(it.source_pr_item_id) as any;
                  }

                  const resolvedPoNum =
                    it.generated_po_number ||
                    prItemRow?.linked_po_number ||
                    null;
                  const resolvedPoStatus =
                    prItemRow?.linked_po_status || null;
                  const rawWaveStatus = String(w.status || "PLANNED").toUpperCase();
                  const masterPrStatusUpper = String(
                    masterPrRow?.status || "UNSYNCED",
                  ).toUpperCase();

                  const lineStatus =
                    rawWaveStatus === "GRN_RECEIVED" ||
                    resolvedPoStatus === "RECEIVED"
                      ? "GRN_RECEIVED"
                      : resolvedPoNum ||
                          rawWaveStatus === "PO_ISSUED" ||
                          rawWaveStatus === "PO_DRAFTED"
                        ? "PO_LINKED"
                        : masterPrStatusUpper === "AUTHORIZED" ||
                            masterPrStatusUpper === "APPROVED" ||
                            masterPrStatusUpper === "ORDERED" ||
                            rawWaveStatus === "PR_AUTHORIZED"
                          ? "PR_AUTHORIZED"
                          : masterPrRow &&
                              (Boolean(prItemRow?.plan_wave_id) ||
                                Boolean(w.generated_pr_id))
                            ? "PR_DRAFTED"
                            : "UNSYNCED";

                  return {
                    plan_item_id: it.id,
                    pr_item_id: prItemRow?.id || it.source_pr_item_id || null,
                    pr_id: masterPrRow?.id || it.source_pr_id || null,
                    pr_number:
                      masterPrRow?.pr_number || it.source_pr_number || null,
                    wave_id: w.id,
                    wave_number: w.wave_number,
                    wave_name: w.wave_name,
                    station_focus: w.station_focus,
                    bop_process_summary: w.bop_process_summary,
                    wot_lot_range: w.wot_lot_range,
                    lot_split_label:
                      it.lot_split_label ||
                      `Wave ${w.wave_number} (${w.wot_lot_range || "Batch"})`,
                    item_id: it.item_id,
                    item_code: it.item_code,
                    item_name: it.item_name,
                    dimension: it.dimension,
                    spec: it.spec,
                    uom: it.uom,
                    product_node_name: it.product_node_name,
                    process_step_name: it.process_step_name,
                    priority_tier: it.priority_tier,
                    baseline_qty: Number(it.total_project_qty || it.allocated_wave_qty || 0),
                    allocated_wave_qty: Number(it.allocated_wave_qty || 0),
                    unit_price: Number(it.unit_price || 0),
                    subtotal_cost:
                      Number(it.allocated_wave_qty || 0) *
                      Number(it.unit_price || 0),
                    target_order_date: w.target_order_date,
                    expected_delivery_date: w.target_arrival_date,
                    station_need_date:
                      it.station_need_date || w.production_need_date,
                    preferred_supplier_id: it.preferred_supplier_id,
                    preferred_supplier_name: it.preferred_supplier_name,
                    po_number: resolvedPoNum,
                    po_status: resolvedPoStatus,
                    line_status: lineStatus,
                  };
                }),
              );

              // 2. Build Initial BOM/PR vs. Wave-Split Quantity Reconciliation Matrix
              const reconMap = new Map<
                string,
                {
                  item_key: string;
                  item_id: string;
                  item_code: string;
                  item_name: string;
                  uom: string;
                  unit_price: number;
                  product_node_name: string | null;
                  process_step_name: string;
                  priority_tier: string;
                  baseline_required_qty: number;
                  total_allocated_qty: number;
                  variance_qty: number;
                  reconciliation_status:
                    | "BALANCED"
                    | "UNDER_ALLOCATED"
                    | "OVER_ALLOCATED";
                  wave_splits: {
                    wave_number: number;
                    wave_id: string;
                    station_focus: string;
                    target_arrival_date: string;
                    allocated_qty: number;
                    pr_item_id: string | null;
                    line_status: string;
                  }[];
                }
              >();

              for (const line of prLines) {
                const key = String(line.item_code || line.item_id);
                const existing = reconMap.get(key);
                if (!existing) {
                  reconMap.set(key, {
                    item_key: key,
                    item_id: line.item_id,
                    item_code: line.item_code,
                    item_name: line.item_name,
                    uom: line.uom,
                    unit_price: line.unit_price,
                    product_node_name: line.product_node_name || null,
                    process_step_name: line.process_step_name,
                    priority_tier: line.priority_tier,
                    baseline_required_qty: Number(line.baseline_qty || 0),
                    total_allocated_qty: Number(line.allocated_wave_qty || 0),
                    variance_qty: 0,
                    reconciliation_status: "BALANCED",
                    wave_splits: [
                      {
                        wave_number: line.wave_number,
                        wave_id: line.wave_id,
                        station_focus: line.station_focus,
                        target_arrival_date: line.expected_delivery_date,
                        allocated_qty: Number(line.allocated_wave_qty || 0),
                        pr_item_id: line.pr_item_id,
                        line_status: line.line_status,
                      },
                    ],
                  });
                } else {
                  existing.baseline_required_qty = Math.max(
                    existing.baseline_required_qty,
                    Number(line.baseline_qty || 0),
                  );
                  existing.total_allocated_qty = Number(
                    (
                      existing.total_allocated_qty +
                      Number(line.allocated_wave_qty || 0)
                    ).toFixed(4),
                  );
                  existing.wave_splits.push({
                    wave_number: line.wave_number,
                    wave_id: line.wave_id,
                    station_focus: line.station_focus,
                    target_arrival_date: line.expected_delivery_date,
                    allocated_qty: Number(line.allocated_wave_qty || 0),
                    pr_item_id: line.pr_item_id,
                    line_status: line.line_status,
                  });
                }
              }

              const reconciliationMatrix = Array.from(reconMap.values()).map(
                (row) => {
                  const variance = Number(
                    (
                      row.total_allocated_qty - row.baseline_required_qty
                    ).toFixed(4),
                  );
                  const status:
                    | "BALANCED"
                    | "UNDER_ALLOCATED"
                    | "OVER_ALLOCATED" =
                    Math.abs(variance) <= 0.001
                      ? "BALANCED"
                      : variance < -0.001
                        ? "UNDER_ALLOCATED"
                        : "OVER_ALLOCATED";
                  return {
                    ...row,
                    variance_qty: variance,
                    reconciliation_status: status,
                  };
                },
              );

              const masterPrSummary = {
                master_pr_id: masterPrRow?.id || null,
                master_pr_number: masterPrRow?.pr_number || null,
                master_pr_title:
                  masterPrRow?.title ||
                  `Master Procurement PR — ${plan.project_name || plan.project_id} (${plan.plan_code})`,
                master_pr_status:
                  syncedWavesCount === 0 && !plan.master_pr_id
                    ? "UNSYNCED"
                    : String(masterPrRow?.status || "DRAFTED").toUpperCase(),
                master_pr_requester:
                  masterPrRow?.requester_name || plan.created_by || "PPIC Planner",
                master_pr_department:
                  masterPrRow?.department || "PPIC / Procurement Plan",
                master_pr_created_at:
                  masterPrRow?.created_at || plan.created_at,
                master_pr_notes: masterPrRow?.notes || plan.notes || "",
                synced_waves_count: syncedWavesCount,
                total_waves_count: wavesWithItems.length,
                total_pr_lines: prLines.length,
                authorized_lines_count: prLines.filter(
                  (l) =>
                    l.line_status === "PR_AUTHORIZED" ||
                    l.line_status === "PO_LINKED" ||
                    l.line_status === "GRN_RECEIVED",
                ).length,
                po_linked_lines_count: prLines.filter(
                  (l) =>
                    l.line_status === "PO_LINKED" ||
                    l.line_status === "GRN_RECEIVED",
                ).length,
                pr_lines: prLines,
              };

              return {
                master_pr_summary: masterPrSummary,
                reconciliation_matrix: reconciliationMatrix,
              };
            })(),
            waves: wavesWithItems,
          };
        });

        res.json(enriched);
      } catch (error: any) {
        console.error("Failed to list procurement plans:", error);
        res.status(500).json({ error: "Failed to list procurement plans" });
      }
    },
  );

  // 3. Simulate a Manufacturing Procurement Plan (from Setup Master + PR/BOM + BOP Process Priority)
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/simulate",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const {
          project_id,
          strategy_mode = "BOP_STAGE_AND_WOT_LOT",
          wot_lots_per_wave,
          lead_time_buffer_days = 3,
        } = req.body || {};

        if (!project_id) {
          return res.status(400).json({ error: "project_id is required" });
        }

        const simulation = buildManufacturingWaveSimulation({
          project_id: String(project_id),
          strategy_mode: normalizeStrategyMode(strategy_mode),
          wot_lots_per_wave: wot_lots_per_wave
            ? Number(wot_lots_per_wave)
            : undefined,
          lead_time_buffer_days: Number(lead_time_buffer_days) || 3,
        });

        res.json(simulation);
      } catch (error: any) {
        console.error("Failed to simulate manufacturing procurement plan:", error);
        res.status(500).json({
          error: error.message || "Failed to simulate procurement plan",
        });
      }
    },
  );

  // 4. Save a Manufacturing Procurement Plan & Lock PR Items (splitting pr_items per wave)
  purchasingRouter.post(
    "/api/purchasing/procurement-plans",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "Purchasing";

        const {
          project_id,
          project_name,
          spk_number,
          plan_name,
          strategy_mode = "BOP_STAGE_AND_WOT_LOT",
          wot_lots_per_wave = 1,
          master_lot_size = 10,
          total_wot_lots = 1,
          shift_hours = 8,
          factory_factor = 85,
          lead_time_buffer_days = 3,
          wave_interval_days = 5,
          notes = "",
          waves = [],
        } = req.body || {};

        if (!project_id || !Array.isArray(waves) || waves.length === 0) {
          return res.status(400).json({
            error: "project_id and at least one wave are required",
          });
        }

        const existingActivePlan = db
          .prepare(
            "SELECT id, plan_code, master_pr_id, master_pr_number, status FROM procurement_plans WHERE project_id = ? AND status != 'ARCHIVED' ORDER BY created_at DESC LIMIT 1",
          )
          .get(project_id) as
          | {
              id: string;
              plan_code: string;
              master_pr_id: string | null;
              master_pr_number: string | null;
              status: string;
            }
          | undefined;

        const planId = "PPLAN-" + Math.random().toString(36).substring(2, 10);
        const planCode = existingActivePlan?.plan_code || generateNextPlanCode();
        const normalizedMode = normalizeStrategyMode(strategy_mode);
        const masterLotSizeVal = Math.max(1, Number(master_lot_size) || 10);
        const wotLotsPerWaveVal = Math.max(1, Number(wot_lots_per_wave) || 1);

        let totalLotQty = 0;
        let totalBudget = 0;
        const uniqueItemIds = new Set<string>();

        waves.forEach((w: any) => {
          (w.items || []).forEach((it: any) => {
            const q = Number(it.allocated_wave_qty || 0);
            const p = Number(it.unit_price || 0);
            totalLotQty += q;
            totalBudget += q * p;
            if (it.item_id) uniqueItemIds.add(it.item_id);
          });
        });

        const insertPlan = db.prepare(`
          INSERT INTO procurement_plans (
            id, plan_code, project_id, project_name, spk_number, plan_name,
            source_type, strategy_mode, total_waves,
            wot_lots_per_wave, master_lot_size, total_wot_lots, shift_hours, factory_factor,
            lead_time_buffer_days, wave_interval_days,
            total_items_count, total_lot_qty, total_estimated_budget,
            master_pr_id, master_pr_number,
            status, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, 'PR_QUEUE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PR_CREATED', ?, ?)
        `);

        const insertWave = db.prepare(`
          INSERT INTO procurement_plan_waves (
            id, plan_id, wave_number, wave_name, station_focus,
            station_id, station_code, bop_process_summary, wot_lot_range, wot_batch_ratio,
            priority_focus, critical_items_count, core_items_count, supporting_items_count,
            target_order_date, target_arrival_date, production_need_date,
            target_fg_delivery_date, target_fg_lot_qty, fg_delivery_status,
            estimated_cost, total_qty_units, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, 'PR_CREATED')
        `);

        const insertItem = db.prepare(`
          INSERT INTO procurement_plan_items (
            id, plan_id, wave_id, wave_number, item_id, item_code, item_name,
            dimension, spec, uom, total_project_qty, allocated_wave_qty,
            unit_price, subtotal_cost, lead_time_days,
            process_step_name, step_sequence, bop_step_id, station_id, station_name, bom_id,
            priority_tier, priority_score, priority_reason,
            downstream_process_count, total_process_count, float_hours,
            is_priority_manual_override, is_critical_path,
            process_allocation_fraction, station_need_date,
            preferred_supplier_id, preferred_supplier_name,
            source_pr_id, source_pr_number, source_pr_item_id, lot_split_label
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let syncedMasterPrId: string | null = existingActivePlan?.master_pr_id || null;
        let syncedMasterPrNumber: string | null = existingActivePlan?.master_pr_number || null;

        const tx = db.transaction(() => {
          if (existingActivePlan) {
            rollbackPrItemsForPlanOrWave({ planId: existingActivePlan.id });
            db.prepare(
              "UPDATE procurement_plans SET status = 'ARCHIVED', plan_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(
              `${existingActivePlan.plan_code}-REV-${existingActivePlan.id.slice(-4)}`,
              existingActivePlan.id,
            );
          }

          insertPlan.run(
            planId,
            planCode,
            project_id,
            project_name || project_id,
            spk_number || null,
            plan_name || `Manufacturing Wave Plan — ${project_name || project_id}`,
            normalizedMode,
            waves.length,
            wotLotsPerWaveVal,
            masterLotSizeVal,
            Math.max(1, Number(total_wot_lots) || 1),
            Math.max(1, Number(shift_hours) || 8),
            Math.max(20, Number(factory_factor) || 85),
            Math.max(1, Number(lead_time_buffer_days) || 3),
            Math.max(0, Number(wave_interval_days) || 0),
            uniqueItemIds.size,
            totalLotQty,
            totalBudget,
            existingActivePlan?.master_pr_id || null,
            existingActivePlan?.master_pr_number || null,
            notes || null,
            username,
          );

          const preparedWaves = waves.map((w: any, wIdx: number) => ({
            ...w,
            waveId: "PWAVE-" + Math.random().toString(36).substring(2, 10),
            waveNumber: Number(w.wave_number) || wIdx + 1,
          }));

          const allocationsByPrItemId = new Map<
            string,
            {
              waveId: string;
              waveNumber: number;
              arrivalDate: string;
              planItemId: string;
              qty: number;
              unitPrice: number;
              rawItem: any;
            }[]
          >();

          for (const pw of preparedWaves) {
            const waveItems = Array.isArray(pw.items) ? pw.items : [];
            const waveQty = waveItems.reduce(
              (s: number, it: any) => s + Number(it.allocated_wave_qty || 0),
              0,
            );
            const waveCost = waveItems.reduce(
              (s: number, it: any) =>
                s +
                Number(it.allocated_wave_qty || 0) * Number(it.unit_price || 0),
              0,
            );

            const criticalCount = waveItems.filter(
              (it: any) =>
                normalizePriorityTier(it.priority_tier) === "CRITICAL_MAIN",
            ).length;
            const coreCount = waveItems.filter(
              (it: any) =>
                normalizePriorityTier(it.priority_tier) === "CORE_PROCESS",
            ).length;
            const supportingCount = waveItems.filter(
              (it: any) =>
                normalizePriorityTier(it.priority_tier) === "SUPPORTING",
            ).length;

            const arrivalDate =
              pw.target_arrival_date || new Date().toISOString().split("T")[0];
            const prodNeedDate =
              pw.production_need_date || arrivalDate;
            const fgDeliveryDate =
              pw.target_fg_delivery_date ||
              addDaysIso(
                prodNeedDate,
                Math.max(2, Number(pw.process_duration_days || 3)),
              );
            const fgLotQty =
              Number(pw.target_fg_lot_qty) > 0
                ? Number(pw.target_fg_lot_qty)
                : Math.max(
                    1,
                    Math.round(
                      masterLotSizeVal *
                        wotLotsPerWaveVal *
                        Number(pw.wot_batch_ratio || 1),
                    ),
                  );

            insertWave.run(
              pw.waveId,
              planId,
              pw.waveNumber,
              pw.wave_name || `Wave ${pw.waveNumber}`,
              pw.station_focus || "Manufacturing Stage",
              pw.station_id || null,
              pw.station_code || null,
              pw.bop_process_summary || pw.station_focus || "Process Stage",
              pw.wot_lot_range || "Full Lot",
              Number(pw.wot_batch_ratio || 1),
              normalizePriorityTier(pw.priority_focus),
              criticalCount,
              coreCount,
              supportingCount,
              pw.target_order_date || arrivalDate,
              arrivalDate,
              prodNeedDate,
              fgDeliveryDate,
              fgLotQty,
              waveCost,
              waveQty,
            );

            for (const it of waveItems) {
              const planItemId =
                "PPITM-" + Math.random().toString(36).substring(2, 10);
              const allocQty = Math.max(
                0.01,
                Number(it.allocated_wave_qty || 1),
              );
              const unitPrice = Math.max(0, Number(it.unit_price || 0));
              const normPriority = normalizePriorityTier(it.priority_tier);

              insertItem.run(
                planItemId,
                planId,
                pw.waveId,
                pw.waveNumber,
                it.item_id,
                it.item_code || it.item_id,
                it.item_name || "Material",
                it.dimension || "",
                it.spec || "",
                it.uom || "PCS",
                Number(it.total_project_qty || allocQty),
                allocQty,
                unitPrice,
                allocQty * unitPrice,
                Number(it.lead_time_days || 4),
                it.process_step_name || "Manufacturing",
                Number(it.step_sequence || 1),
                it.bop_step_id || null,
                it.station_id || pw.station_id || null,
                it.station_name || pw.station_focus || null,
                it.bom_id || null,
                normPriority,
                Number(it.priority_score || 55),
                it.priority_reason || null,
                Number(it.downstream_process_count || 1),
                Number(it.total_process_count || 1),
                Number(it.float_hours || 0),
                0,
                it.is_critical_path ? 1 : 0,
                Number(it.process_allocation_fraction || 1),
                it.station_need_date || prodNeedDate,
                it.preferred_supplier_id || null,
                it.preferred_supplier_name || null,
                it.source_pr_id || null,
                it.source_pr_number || null,
                it.source_pr_item_id || null,
                it.lot_split_label || "Wave Allocation",
              );

              if (it.source_pr_item_id) {
                const list =
                  allocationsByPrItemId.get(it.source_pr_item_id) || [];
                list.push({
                  waveId: pw.waveId,
                  waveNumber: pw.waveNumber,
                  arrivalDate,
                  planItemId,
                  qty: allocQty,
                  unitPrice,
                  rawItem: it,
                });
                allocationsByPrItemId.set(it.source_pr_item_id, list);
              }
            }
          }

          // Split & Lock underlying pr_items if sourced from an existing PR
          let detectedMasterPrId: string | null = existingActivePlan?.master_pr_id || null;
          let detectedMasterPrNumber: string | null = existingActivePlan?.master_pr_number || null;

          for (const [origPriId, allocs] of allocationsByPrItemId.entries()) {
            const origPri = db
              .prepare(
                "SELECT * FROM pr_items WHERE id = ? AND po_id IS NULL AND plan_id IS NULL",
              )
              .get(origPriId) as any;

            if (!origPri || allocs.length === 0) continue;

            if (!detectedMasterPrId && origPri.pr_id) {
              const parentPrObj = db
                .prepare("SELECT id, pr_number FROM purchase_requests WHERE id = ?")
                .get(origPri.pr_id) as any;
              if (parentPrObj) {
                detectedMasterPrId = parentPrObj.id;
                detectedMasterPrNumber = parentPrObj.pr_number;
              }
            }

            const origQty = Number(origPri.qty || 0);
            const totalAllocatedQty = allocs.reduce((s, a) => s + a.qty, 0);

            const firstAlloc = allocs[0];
            db.prepare(
              `UPDATE pr_items
               SET qty = ?,
                   unit_price = ?,
                   expected_delivery_date = ?,
                   plan_id = ?,
                   plan_wave_id = ?,
                   wave_number = ?,
                   station_focus = ?,
                   lot_split_label = ?,
                   preferred_supplier_id = ?,
                   preferred_supplier_name = ?,
                   original_baseline_qty = COALESCE(original_baseline_qty, ?),
                   parent_pr_item_id = COALESCE(parent_pr_item_id, id)
               WHERE id = ?`,
            ).run(
              firstAlloc.qty,
              firstAlloc.unitPrice,
              firstAlloc.arrivalDate,
              planId,
              firstAlloc.waveId,
              firstAlloc.waveNumber,
              firstAlloc.rawItem?.station_name || `Wave ${firstAlloc.waveNumber}`,
              firstAlloc.rawItem?.lot_split_label || `Wave ${firstAlloc.waveNumber}`,
              firstAlloc.rawItem?.preferred_supplier_id || null,
              firstAlloc.rawItem?.preferred_supplier_name || null,
              origQty,
              origPri.id,
            );

            for (let i = 1; i < allocs.length; i++) {
              const nextAlloc = allocs[i];
              const splitPriId =
                "PRI-" + Math.random().toString(36).substring(2, 10);
              db.prepare(
                `INSERT INTO pr_items (
                   id, pr_id, item_id, dimension, spec, qty, unit_price,
                   expected_delivery_date, plan_id, plan_wave_id, parent_pr_item_id,
                   wave_number, station_focus, lot_split_label,
                   preferred_supplier_id, preferred_supplier_name, original_baseline_qty
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              ).run(
                splitPriId,
                origPri.pr_id,
                origPri.item_id,
                origPri.dimension || "",
                origPri.spec || "",
                nextAlloc.qty,
                nextAlloc.unitPrice,
                nextAlloc.arrivalDate,
                planId,
                nextAlloc.waveId,
                origPri.parent_pr_item_id || origPri.id,
                nextAlloc.waveNumber,
                nextAlloc.rawItem?.station_name || `Wave ${nextAlloc.waveNumber}`,
                nextAlloc.rawItem?.lot_split_label || `Wave ${nextAlloc.waveNumber}`,
                nextAlloc.rawItem?.preferred_supplier_id || null,
                nextAlloc.rawItem?.preferred_supplier_name || null,
                origQty,
              );

              db.prepare(
                "UPDATE procurement_plan_items SET source_pr_item_id = ? WHERE id = ?",
              ).run(splitPriId, nextAlloc.planItemId);
            }

            const remainder = Number((origQty - totalAllocatedQty).toFixed(4));
            if (remainder > 0.001) {
              const remPriId =
                "PRI-" + Math.random().toString(36).substring(2, 10);
              db.prepare(
                `INSERT INTO pr_items (
                   id, pr_id, item_id, dimension, spec, qty, unit_price,
                   expected_delivery_date, plan_id, plan_wave_id, parent_pr_item_id, original_baseline_qty
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
              ).run(
                remPriId,
                origPri.pr_id,
                origPri.item_id,
                origPri.dimension || "",
                origPri.spec || "",
                remainder,
                origPri.unit_price || firstAlloc.unitPrice,
                origPri.expected_delivery_date,
                origPri.parent_pr_item_id || origPri.id,
                origQty,
              );
            }
          }

          if (detectedMasterPrId) {
            db.prepare(
              "UPDATE procurement_plans SET master_pr_id = ?, master_pr_number = ? WHERE id = ?",
            ).run(detectedMasterPrId, detectedMasterPrNumber, planId);
          }

          // Automatically push all waves into the consolidated Master Project PR in Requisition Queue (status = 'DRAFTED', category = 'PROJECT')
          for (const pw of preparedWaves) {
            const syncRes = pushWaveToDesignRequestPr(planId, pw.waveId, username);
            syncedMasterPrId = syncRes.pr_id;
            syncedMasterPrNumber = syncRes.pr_number;
          }

          if (syncedMasterPrId) {
            db.prepare(
              `UPDATE purchase_requests
               SET status = 'DRAFTED',
                   category = 'PROJECT',
                   department = 'PROCUREMENT',
                   revision_note = NULL
               WHERE id = ? AND status NOT IN ('ORDERED', 'RECEIVED', 'PARTIAL', 'PO_ISSUED')`,
            ).run(syncedMasterPrId);

            db.prepare(
              `UPDATE procurement_plans
               SET status = 'PR_CREATED',
                   master_pr_id = ?,
                   master_pr_number = ?,
                   revision_note = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
            ).run(syncedMasterPrId, syncedMasterPrNumber, planId);
          }
        });

        tx();

        outboxService.enqueue(
          db,
          "PROCUREMENT_PLANS",
          planId,
          "CREATE",
          {
            id: planId,
            plan_code: planCode,
            project_id,
            plan_name:
              plan_name ||
              `Manufacturing Wave Plan — ${project_name || project_id}`,
            total_waves: waves.length,
            total_lot_qty: totalLotQty,
            total_estimated_budget: totalBudget,
            master_pr_id: syncedMasterPrId,
            master_pr_number: syncedMasterPrNumber,
            created_at: new Date().toISOString(),
          },
          "BOTH",
        );

        logAudit(
          username,
          "SUBMIT_PROCUREMENT_STRATEGY",
          "PROCUREMENT_PLAN",
          planId,
          `Submitted Manufacturing Procurement Strategy ${planCode} for project ${project_name || project_id} (${waves.length} waves) and routed Master PR ${syncedMasterPrNumber || ""} to Requisition Queue`,
        );

        res.json({
          success: true,
          id: planId,
          plan_code: planCode,
          master_pr_id: syncedMasterPrId,
          master_pr_number: syncedMasterPrNumber,
          message: `Strategy ${planCode} submitted! Consolidated Master PR ${syncedMasterPrNumber || ""} is now in Requisition Queue (/requests) awaiting Manager review.`,
        });
      } catch (error: any) {
        console.error("Failed to create procurement plan:", error);
        res.status(500).json({
          error: error.message || "Failed to save Procurement Plan",
        });
      }
    },
  );

  // 5a. Update Supplier Assignment on a Saved Plan Item
  purchasingRouter.patch(
    "/api/purchasing/procurement-plans/:planId/items/:itemId/supplier",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId, itemId } = req.params;
        const { supplier_id } = req.body || {};

        const planItem = db
          .prepare(
            "SELECT * FROM procurement_plan_items WHERE id = ? AND plan_id = ?",
          )
          .get(itemId, planId) as any;
        if (!planItem) {
          return res.status(404).json({ error: "Plan item not found" });
        }

        const supRow = supplier_id
          ? (db
              .prepare("SELECT id, name FROM suppliers WHERE id = ?")
              .get(supplier_id) as any)
          : null;

        const catalogPriceRow =
          supplier_id && planItem.item_id
            ? (db
                .prepare(
                  "SELECT unit_price FROM item_supplier_prices WHERE item_id = ? AND supplier_id = ? AND unit_price > 0",
                )
                .get(planItem.item_id, supplier_id) as
                | { unit_price: number }
                | undefined)
            : undefined;

        const nextUnitPrice =
          catalogPriceRow?.unit_price !== undefined
            ? Number(catalogPriceRow.unit_price)
            : Number(planItem.unit_price || 0);
        const nextSubtotal =
          Number(planItem.allocated_wave_qty || 0) * nextUnitPrice;

        db.transaction(() => {
          db.prepare(
            `UPDATE procurement_plan_items
             SET preferred_supplier_id = ?,
                 preferred_supplier_name = ?,
                 unit_price = ?,
                 subtotal_cost = ?
             WHERE id = ?`,
          ).run(
            supRow?.id || null,
            supRow?.name || null,
            nextUnitPrice,
            nextSubtotal,
            itemId,
          );

          if (planItem.source_pr_item_id) {
            db.prepare("UPDATE pr_items SET unit_price = ? WHERE id = ?").run(
              nextUnitPrice,
              planItem.source_pr_item_id,
            );
          }

          const waveSum = db
            .prepare(
              "SELECT COALESCE(SUM(subtotal_cost), 0) as total FROM procurement_plan_items WHERE wave_id = ?",
            )
            .get(planItem.wave_id) as { total: number };
          db.prepare(
            "UPDATE procurement_plan_waves SET estimated_cost = ? WHERE id = ?",
          ).run(waveSum.total, planItem.wave_id);
        })();

        res.json({
          success: true,
          preferred_supplier_id: supRow?.id || null,
          preferred_supplier_name: supRow?.name || null,
          unit_price: nextUnitPrice,
          subtotal_cost: nextSubtotal,
        });
      } catch (error: any) {
        console.error("Failed to update plan item supplier:", error);
        res.status(500).json({ error: "Failed to update supplier assignment" });
      }
    },
  );

  // 5b. Update Manufacturing Priority Tier on a Saved Plan Item (Manual Override)
  purchasingRouter.patch(
    "/api/purchasing/procurement-plans/:planId/items/:itemId/priority",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId, itemId } = req.params;
        const { priority_tier } = req.body || {};

        const planItem = db
          .prepare(
            "SELECT * FROM procurement_plan_items WHERE id = ? AND plan_id = ?",
          )
          .get(itemId, planId) as any;
        if (!planItem) {
          return res.status(404).json({ error: "Plan item not found" });
        }

        const nextPriority = normalizePriorityTier(priority_tier);

        db.transaction(() => {
          db.prepare(
            `UPDATE procurement_plan_items
             SET priority_tier = ?,
                 is_priority_manual_override = 1
             WHERE id = ?`,
          ).run(nextPriority, itemId);

          const waveItems = db
            .prepare(
              "SELECT priority_tier FROM procurement_plan_items WHERE wave_id = ?",
            )
            .all(planItem.wave_id) as { priority_tier: string }[];

          const crit = waveItems.filter(
            (x) => normalizePriorityTier(x.priority_tier) === "CRITICAL_MAIN",
          ).length;
          const core = waveItems.filter(
            (x) => normalizePriorityTier(x.priority_tier) === "CORE_PROCESS",
          ).length;
          const supp = waveItems.filter(
            (x) => normalizePriorityTier(x.priority_tier) === "SUPPORTING",
          ).length;

          const focus: ManufacturingPriorityTier =
            crit > 0 ? "CRITICAL_MAIN" : core > 0 ? "CORE_PROCESS" : "SUPPORTING";

          db.prepare(
            `UPDATE procurement_plan_waves
             SET priority_focus = ?,
                 critical_items_count = ?,
                 core_items_count = ?,
                 supporting_items_count = ?
             WHERE id = ?`,
          ).run(focus, crit, core, supp, planItem.wave_id);
        })();

        res.json({
          success: true,
          priority_tier: nextPriority,
          is_priority_manual_override: true,
        });
      } catch (error: any) {
        console.error("Failed to update plan item priority:", error);
        res.status(500).json({ error: "Failed to update item priority" });
      }
    },
  );

  // Helper to resolve or create the Single Master Project PR (in DRAFTED status for Manager Authorization)
  const resolveOrCreateMasterProjectPr = (plan: any, username: string) => {
    let masterPrId: string | null = plan.master_pr_id || null;
    let masterPrNumber: string | null = plan.master_pr_number || null;

    if (masterPrId) {
      const existingMaster = db
        .prepare(
          "SELECT id, pr_number, status FROM purchase_requests WHERE id = ? AND status != 'CANCELLED' AND COALESCE(archived, 0) = 0",
        )
        .get(masterPrId) as any;
      if (existingMaster) {
        masterPrNumber = existingMaster.pr_number;
      } else {
        masterPrId = null;
        masterPrNumber = null;
      }
    }

    if (!masterPrId) {
      const wavePr = db
        .prepare(
          `SELECT generated_pr_id FROM procurement_plan_waves
           WHERE plan_id = ? AND generated_pr_id IS NOT NULL
           ORDER BY wave_number ASC LIMIT 1`,
        )
        .get(plan.id) as { generated_pr_id?: string } | undefined;

      if (wavePr?.generated_pr_id) {
        const existingWavePr = db
          .prepare(
            "SELECT id, pr_number FROM purchase_requests WHERE id = ? AND status != 'CANCELLED' AND COALESCE(archived, 0) = 0",
          )
          .get(wavePr.generated_pr_id) as any;
        if (existingWavePr) {
          masterPrId = existingWavePr.id;
          masterPrNumber = existingWavePr.pr_number;
        }
      }
    }

    if (!masterPrId) {
      const itemSourcePr = db
        .prepare(
          `SELECT source_pr_id FROM procurement_plan_items
           WHERE plan_id = ? AND source_pr_id IS NOT NULL AND source_pr_id NOT LIKE 'BOM-MRP-%'
           ORDER BY wave_number ASC LIMIT 1`,
        )
        .get(plan.id) as { source_pr_id?: string } | undefined;

      if (itemSourcePr?.source_pr_id) {
        const existingItemPr = db
          .prepare(
            "SELECT id, pr_number FROM purchase_requests WHERE id = ? AND status != 'CANCELLED' AND COALESCE(archived, 0) = 0",
          )
          .get(itemSourcePr.source_pr_id) as any;
        if (existingItemPr) {
          masterPrId = existingItemPr.id;
          masterPrNumber = existingItemPr.pr_number;
        }
      }
    }

    if (!masterPrId && plan.project_id) {
      const projPr = db
        .prepare(
          `SELECT id, pr_number FROM purchase_requests
           WHERE project_id = ? AND status != 'CANCELLED' AND COALESCE(archived, 0) = 0
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(plan.project_id) as any;
      if (projPr) {
        masterPrId = projPr.id;
        masterPrNumber = projPr.pr_number;
      }
    }

    const prTitle = `Master Procurement PR — ${plan.project_name || plan.project_id} (${plan.plan_code})`;
    const prNotes = `Master Project PR generated from Procurement Plan ${plan.plan_code} (${plan.total_waves || 1} staged delivery waves). Pending Manager Authorization.`;
    const estCost = Number(plan.total_estimated_budget || 0);

    if (!masterPrId) {
      masterPrId = "PR-" + Math.random().toString(36).substring(2, 10);
      masterPrNumber = `PR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

      db.prepare(
        `INSERT INTO purchase_requests (
           id, pr_number, project_id, title, remarks, requester_name, requested_by, created_by,
           department, category, total_estimated_cost, status, revision_note, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROCUREMENT', 'PROJECT', ?, 'DRAFTED', NULL, ?)`,
      ).run(
        masterPrId,
        masterPrNumber,
        plan.project_id,
        prTitle,
        prTitle,
        username || "PPIC Planner",
        username || "PPIC Planner",
        username || "PPIC Planner",
        estCost,
        prNotes,
      );
    } else {
      // Ensure Master PR enters DRAFTED state for Manager Authorization unless already ORDERED, and clear revision_note
      db.prepare(
        `UPDATE purchase_requests
         SET status = CASE WHEN status IN ('ORDERED', 'PARTIAL_ORDERED', 'COMPLETED') THEN status ELSE 'DRAFTED' END,
             revision_note = NULL,
             category = COALESCE(NULLIF(category, ''), 'PROJECT'),
             department = COALESCE(NULLIF(department, ''), 'PROCUREMENT'),
             title = COALESCE(NULLIF(title, ''), ?),
             remarks = COALESCE(NULLIF(remarks, ''), ?),
             total_estimated_cost = CASE WHEN ? > 0 THEN ? ELSE total_estimated_cost END
         WHERE id = ?`,
      ).run(prTitle, prTitle, estCost, estCost, masterPrId);

      // Remove any stale unexecuted wave-split pr_items from older archived plans for this Master PR
      db.prepare(
        `DELETE FROM pr_items
         WHERE pr_id = ?
           AND po_id IS NULL
           AND plan_id IS NOT NULL
           AND plan_id != ?`,
      ).run(masterPrId, plan.id);
    }

    db.prepare(
      "UPDATE procurement_plans SET master_pr_id = ?, master_pr_number = ?, revision_note = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(masterPrId, masterPrNumber, plan.id);

    return { masterPrId: masterPrId!, masterPrNumber: masterPrNumber! };
  };

  // Helper to push/sync a single wave's items & planned delivery date into the Single Master Project PR (with Wave-Split pr_items rows)
  const pushWaveToDesignRequestPr = (
    planId: string,
    waveId: string,
    username: string,
  ) => {
    const plan = db
      .prepare("SELECT * FROM procurement_plans WHERE id = ?")
      .get(planId) as any;
    if (!plan) {
      throw new Error("Procurement Plan not found");
    }

    const wave = db
      .prepare(
        "SELECT * FROM procurement_plan_waves WHERE id = ? AND plan_id = ?",
      )
      .get(waveId, planId) as any;
    if (!wave) {
      throw new Error("Wave not found in this plan");
    }

    const waveItems = db
      .prepare(
        "SELECT * FROM procurement_plan_items WHERE wave_id = ? AND plan_id = ? ORDER BY step_sequence ASC",
      )
      .all(waveId, planId) as any[];
    if (waveItems.length === 0) {
      throw new Error("Wave has no items to push to Master PR");
    }

    const arrivalDate =
      wave.target_arrival_date || new Date().toISOString().split("T")[0];

    const { masterPrId, masterPrNumber } = resolveOrCreateMasterProjectPr(
      plan,
      username,
    );

    for (const wItem of waveItems) {
      const allocQty = Math.max(0.01, Number(wItem.allocated_wave_qty || 1));
      const unitPrice = Math.max(0, Number(wItem.unit_price || 0));
      const baselineQty = Math.max(
        allocQty,
        Number(wItem.total_project_qty || allocQty),
      );
      const splitLabel =
        wItem.lot_split_label ||
        `Wave ${wave.wave_number}${wave.wot_lot_range ? ` · ${wave.wot_lot_range}` : ""}`;

      const candidatePri =
        wItem.source_pr_item_id &&
        !String(wItem.source_pr_item_id).startsWith("BOM-MRP-")
          ? (db
              .prepare("SELECT * FROM pr_items WHERE id = ?")
              .get(wItem.source_pr_item_id) as any)
          : null;

      // Only update in place if candidatePri is unassigned OR already belongs to THIS waveId
      const canUpdateInPlace =
        candidatePri &&
        (!candidatePri.plan_wave_id || candidatePri.plan_wave_id === waveId);

      if (canUpdateInPlace) {
        db.prepare(
          `UPDATE pr_items
           SET pr_id = ?,
               qty = ?,
               unit_price = ?,
               expected_delivery_date = ?,
               plan_id = ?,
               plan_wave_id = ?,
               wave_number = ?,
               station_focus = ?,
               lot_split_label = ?,
               preferred_supplier_id = ?,
               preferred_supplier_name = ?,
               original_baseline_qty = COALESCE(original_baseline_qty, ?)
           WHERE id = ?`,
        ).run(
          masterPrId,
          allocQty,
          unitPrice,
          arrivalDate,
          planId,
          waveId,
          wave.wave_number,
          wave.station_focus || wItem.station_name || "Manufacturing",
          splitLabel,
          wItem.preferred_supplier_id || null,
          wItem.preferred_supplier_name || null,
          baselineQty,
          candidatePri.id,
        );

        db.prepare(
          `UPDATE procurement_plan_items
           SET source_pr_id = ?,
               source_pr_number = ?,
               station_need_date = ?
           WHERE id = ?`,
        ).run(
          masterPrId,
          masterPrNumber,
          wave.production_need_date,
          wItem.id,
        );
      } else {
        const newPriId = "PRI-" + Math.random().toString(36).substring(2, 10);
        const parentPriId =
          candidatePri?.parent_pr_item_id || candidatePri?.id || null;

        db.prepare(
          `INSERT INTO pr_items (
             id, pr_id, item_id, dimension, spec, qty, unit_price,
             expected_delivery_date, plan_id, plan_wave_id, parent_pr_item_id,
             wave_number, station_focus, lot_split_label,
             preferred_supplier_id, preferred_supplier_name, original_baseline_qty
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          newPriId,
          masterPrId,
          wItem.item_id,
          wItem.dimension || "",
          wItem.spec || "",
          allocQty,
          unitPrice,
          arrivalDate,
          planId,
          waveId,
          parentPriId,
          wave.wave_number,
          wave.station_focus || wItem.station_name || "Manufacturing",
          splitLabel,
          wItem.preferred_supplier_id || null,
          wItem.preferred_supplier_name || null,
          baselineQty,
        );

        db.prepare(
          `UPDATE procurement_plan_items
           SET source_pr_id = ?,
               source_pr_number = ?,
               source_pr_item_id = ?,
               station_need_date = ?
           WHERE id = ?`,
        ).run(
          masterPrId,
          masterPrNumber,
          newPriId,
          wave.production_need_date,
          wItem.id,
        );
      }
    }

    db.prepare(
      `UPDATE procurement_plan_waves
       SET status = CASE WHEN status IN ('PO_DRAFTED', 'PO_ISSUED', 'GRN_PARTIAL', 'GRN_RECEIVED') THEN status ELSE 'PR_DRAFTED' END,
           generated_pr_id = ?,
           generated_pr_number = ?,
           executed_at = COALESCE(executed_at, CURRENT_TIMESTAMP)
       WHERE id = ?`,
    ).run(masterPrId, masterPrNumber, waveId);

    reconcileWaveAndPlanLifecycleByWaveId(waveId);

    return {
      wave_id: waveId,
      wave_number: wave.wave_number,
      pr_id: masterPrId,
      pr_number: masterPrNumber,
      pr_status: "DRAFTED",
      expected_delivery_date: arrivalDate,
      production_need_date: wave.production_need_date,
      items_count: waveItems.length,
    };
  };

  // 5c. Push a Single Wave into the Master Project PR (Drafted for Manager Authorization)
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/:planId/waves/:waveId/push-to-pr",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId, waveId } = req.params;
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "PPIC Planner";

        const result = db.transaction(() =>
          pushWaveToDesignRequestPr(planId, waveId, username),
        )();

        logAudit(
          username,
          "PUSH_WAVE_TO_PR",
          "PROCUREMENT_PLAN",
          planId,
          `Synced Wave ${result.wave_number} into Master PR ${result.pr_number} (Status: DRAFTED for Manager Authorization · Delivery: ${result.expected_delivery_date})`,
        );

        res.json({
          success: true,
          ...result,
          message: `Wave ${result.wave_number} synced to Master PR (${result.pr_number}) as DRAFTED. Ready for Manager Authorization.`,
        });
      } catch (error: any) {
        console.error("Failed to push wave to Master PR:", error);
        res.status(500).json({
          error: error.message || "Failed to push wave to Master PR",
        });
      }
    },
  );

  // 5d. Push All Waves in a Plan into the Single Master Project PR (Drafted for Manager Authorization)
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/:planId/push-all-to-pr",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId } = req.params;
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "PPIC Planner";

        const waves = db
          .prepare(
            "SELECT id, wave_number FROM procurement_plan_waves WHERE plan_id = ? ORDER BY wave_number ASC",
          )
          .all(planId) as { id: string; wave_number: number }[];

        if (waves.length === 0) {
          return res.status(400).json({ error: "No waves found in this plan" });
        }

        const results = db.transaction(() =>
          waves.map((w) => pushWaveToDesignRequestPr(planId, w.id, username)),
        )();

        const masterPrNum = results[0]?.pr_number || "PR";

        logAudit(
          username,
          "PUSH_ALL_WAVES_TO_PR",
          "PROCUREMENT_PLAN",
          planId,
          `Consolidated all ${results.length} wave(s) into Master Draft PR ${masterPrNum} for Manager Authorization`,
        );

        res.json({
          success: true,
          synced_waves: results,
          master_pr_number: masterPrNum,
          message: `All ${results.length} wave(s) consolidated into Master Draft PR (${masterPrNum}). Pending Manager Authorization.`,
        });
      } catch (error: any) {
        console.error("Failed to push all waves to Master PR:", error);
        res.status(500).json({
          error: error.message || "Failed to sync plan waves to Master PR",
        });
      }
    },
  );

  // 5e. Authorize Master Project PR (Manager / FC / Executive Approval Gate)
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/:planId/authorize-master-pr",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId } = req.params;
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "Manager";

        const plan = db
          .prepare("SELECT * FROM procurement_plans WHERE id = ?")
          .get(planId) as any;
        if (!plan) {
          return res.status(404).json({ error: "Procurement Plan not found" });
        }

        const waves = db
          .prepare(
            "SELECT id, wave_number FROM procurement_plan_waves WHERE plan_id = ? ORDER BY wave_number ASC",
          )
          .all(planId) as { id: string; wave_number: number }[];

        const result = db.transaction(() => {
          // Ensure all waves are synced to the Single Master PR first
          const synced = waves.map((w) =>
            pushWaveToDesignRequestPr(planId, w.id, username),
          );
          const masterPrId = synced[0]?.pr_id || plan.master_pr_id;
          const masterPrNumber = synced[0]?.pr_number || plan.master_pr_number;

          if (!masterPrId) {
            throw new Error("Master PR could not be resolved for authorization");
          }

          db.prepare(
            `UPDATE purchase_requests
             SET status = 'AUTHORIZED'
             WHERE id = ?`,
          ).run(masterPrId);

          db.prepare(
            `UPDATE procurement_plan_waves
             SET status = CASE WHEN status IN ('PO_DRAFTED', 'PO_ISSUED', 'GRN_PARTIAL', 'GRN_RECEIVED') THEN status ELSE 'PR_AUTHORIZED' END
             WHERE plan_id = ?`,
          ).run(planId);

          for (const w of waves) {
            reconcileWaveAndPlanLifecycleByWaveId(w.id);
          }

          return {
            master_pr_id: masterPrId,
            master_pr_number: masterPrNumber,
            waves_count: waves.length,
          };
        })();

        logAudit(
          username,
          "AUTHORIZE_MASTER_PR",
          "PROCUREMENT_PLAN",
          planId,
          `Authorized Master Project PR ${result.master_pr_number} (${result.waves_count} wave schedule splits unlocked for PO execution)`,
        );

        res.json({
          success: true,
          ...result,
          message: `Master PR ${result.master_pr_number} AUTHORIZED (${result.waves_count} wave schedule splits ready for PO execution).`,
        });
      } catch (error: any) {
        console.error("Failed to authorize Master PR:", error);
        res.status(500).json({
          error: error.message || "Failed to authorize Master PR",
        });
      }
    },
  );

  // 5f. Rebalance Wave Split Quantities to Match Initial Baseline BOM/PR Requirement
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/:planId/rebalance-quantities",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId } = req.params;
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "PPIC Planner";

        const planItems = db
          .prepare(
            "SELECT * FROM procurement_plan_items WHERE plan_id = ? ORDER BY wave_number ASC",
          )
          .all(planId) as any[];

        if (planItems.length === 0) {
          return res.status(400).json({ error: "No items found in this plan" });
        }

        const byItemKey = new Map<string, any[]>();
        for (const it of planItems) {
          const key = String(it.item_code || it.item_id);
          const list = byItemKey.get(key) || [];
          list.push(it);
          byItemKey.set(key, list);
        }

        db.transaction(() => {
          for (const [, rows] of byItemKey.entries()) {
            const baselineQty = Math.max(
              0.01,
              ...rows.map((r) => Number(r.total_project_qty || 0)),
            );
            const currentSum = rows.reduce(
              (s, r) => s + Number(r.allocated_wave_qty || 0),
              0,
            );
            if (Math.abs(currentSum - baselineQty) <= 0.001) continue;

            let runningSum = 0;
            rows.forEach((r, idx) => {
              let nextQty = 0;
              if (idx === rows.length - 1) {
                nextQty = Math.max(
                  0.01,
                  Number((baselineQty - runningSum).toFixed(2)),
                );
              } else {
                const ratio =
                  currentSum > 0
                    ? Number(r.allocated_wave_qty || 0) / currentSum
                    : 1 / rows.length;
                nextQty = Math.max(
                  0.01,
                  Number((baselineQty * ratio).toFixed(2)),
                );
                runningSum += nextQty;
              }
              const unitPrice = Number(r.unit_price || 0);
              const nextSubtotal = Math.round(nextQty * unitPrice);

              db.prepare(
                `UPDATE procurement_plan_items
                 SET allocated_wave_qty = ?,
                     subtotal_cost = ?,
                     total_project_qty = ?
                 WHERE id = ?`,
              ).run(nextQty, nextSubtotal, baselineQty, r.id);

              if (
                r.source_pr_item_id &&
                !String(r.source_pr_item_id).startsWith("BOM-MRP-")
              ) {
                db.prepare(
                  "UPDATE pr_items SET qty = ?, original_baseline_qty = ? WHERE id = ?",
                ).run(nextQty, baselineQty, r.source_pr_item_id);
              }
            });
          }

          // Recompute wave & plan totals
          const waves = db
            .prepare("SELECT id FROM procurement_plan_waves WHERE plan_id = ?")
            .all(planId) as { id: string }[];

          let totalLot = 0;
          let totalBudget = 0;

          for (const w of waves) {
            const wItems = db
              .prepare(
                "SELECT allocated_wave_qty, subtotal_cost FROM procurement_plan_items WHERE wave_id = ?",
              )
              .all(w.id) as { allocated_wave_qty: number; subtotal_cost: number }[];
            const wQty = wItems.reduce(
              (s, i) => s + Number(i.allocated_wave_qty || 0),
              0,
            );
            const wCost = wItems.reduce(
              (s, i) => s + Number(i.subtotal_cost || 0),
              0,
            );
            totalLot += wQty;
            totalBudget += wCost;

            db.prepare(
              "UPDATE procurement_plan_waves SET total_qty_units = ?, estimated_cost = ? WHERE id = ?",
            ).run(wQty, wCost, w.id);
          }

          db.prepare(
            "UPDATE procurement_plans SET total_lot_qty = ?, total_estimated_budget = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(totalLot, totalBudget, planId);
        })();

        logAudit(
          username,
          "REBALANCE_PROCUREMENT_PLAN_QTY",
          "PROCUREMENT_PLAN",
          planId,
          "Rebalanced wave split quantities to match initial baseline BOM/PR requirements",
        );

        res.json({
          success: true,
          message:
            "All wave split quantities rebalanced to 100% match initial BOM/PR baseline requirements.",
        });
      } catch (error: any) {
        console.error("Failed to rebalance plan quantities:", error);
        res.status(500).json({
          error: error.message || "Failed to rebalance plan quantities",
        });
      }
    },
  );

  // 5h. Request Revision on a Procurement Plan & Return Master PR to REVISION
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/:planId/request-revision",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId } = req.params;
        const { revision_note } = req.body || {};
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "Manager";

        const noteText = String(revision_note || "").trim();
        if (!noteText) {
          return res.status(400).json({
            error: "Revision note is required when returning a strategy for revision.",
          });
        }

        const plan = db
          .prepare("SELECT * FROM procurement_plans WHERE id = ?")
          .get(planId) as any;
        if (!plan) {
          return res.status(404).json({ error: "Procurement Plan not found" });
        }

        db.transaction(() => {
          db.prepare(
            `UPDATE procurement_plans
             SET status = 'REVISION',
                 revision_note = ?,
                 revised_by = ?,
                 revised_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).run(noteText, username, planId);

          db.prepare(
            `UPDATE procurement_plan_waves
             SET status = 'REVISION'
             WHERE plan_id = ? AND status NOT IN ('PO_ISSUED', 'ORDERED', 'RECEIVED', 'COMPLETED')`,
          ).run(planId);

          if (plan.master_pr_id) {
            db.prepare(
              `UPDATE purchase_requests
               SET status = 'REVISION',
                   revision_note = ?
               WHERE id = ?`,
            ).run(noteText, plan.master_pr_id);
          }
        })();

        logAudit(
          username,
          "REVISE_PROCUREMENT_PLAN",
          "PROCUREMENT_PLAN",
          planId,
          `Returned Procurement Strategy ${plan.plan_code} for revision: ${noteText}`,
        );

        res.json({
          success: true,
          status: "REVISION",
          revision_note: noteText,
          message: `Strategy ${plan.plan_code} and Master PR ${plan.master_pr_number || ""} returned for revision.`,
        });
      } catch (error: any) {
        console.error("Failed to request revision on procurement plan:", error);
        res.status(500).json({
          error: error.message || "Failed to request revision on procurement plan",
        });
      }
    },
  );

  // 5i. Get End-to-End WOT Partial Delivery & Customer Invoicing Value Chain
  purchasingRouter.get(
    "/api/purchasing/procurement-plans/:planId/partial-delivery-chain",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId } = req.params;

        const plan = db
          .prepare(
            `SELECT p.*, prj.title as project_title, prj.customer_id, prj.value as project_contract_value,
                    c.name as customer_name, c.address as customer_address
             FROM procurement_plans p
             LEFT JOIN projects prj ON p.project_id = prj.id
             LEFT JOIN customers c ON prj.customer_id = c.id
             WHERE p.id = ?`,
          )
          .get(planId) as any;

        if (!plan) {
          return res.status(404).json({ error: "Procurement Plan not found" });
        }

        const waves = db
          .prepare(
            `SELECT w.*,
                    fgr.fgr_number as live_fgr_number, fgr.quantity as fgr_qty, fgr.status as fgr_status, fgr.created_at as fgr_created_at,
                    dn.dn_number as live_dn_number, dn.status as dn_status, dn.delivered_at as dn_delivered_at, dn.invoiced_at as dn_invoiced_at,
                    ci.ci_number as live_ci_number, ci.amount as ci_amount, ci.grand_total as ci_grand_total, ci.status as ci_status, ci.billing_mode as ci_billing_mode
             FROM procurement_plan_waves w
             LEFT JOIN finish_good_records fgr ON w.fgr_id = fgr.id
             LEFT JOIN delivery_notes dn ON w.linked_dn_id = dn.id
             LEFT JOIN commercial_invoices ci ON w.linked_ci_id = ci.id
             WHERE w.plan_id = ?
             ORDER BY w.wave_number ASC`,
          )
          .all(planId) as any[];

        const wotHeader = db
          .prepare(
            `SELECT wot.id, wot.wot_number, wot.total_lots, wot.lot_size, wot.status
             FROM work_order_travelers wot
             WHERE wot.project_id = ?
             ORDER BY wot.created_at DESC LIMIT 1`,
          )
          .get(plan.project_id) as any;

        const wotLots = wotHeader
          ? (db
              .prepare(
                `SELECT id, lot_number, lot_code, target_qty, completed_qty, status, current_step_seq
                 FROM wot_lots
                 WHERE wot_id = ?
                 ORDER BY lot_number ASC`,
              )
              .all(wotHeader.id) as any[])
          : [];

        const totalWaves = Math.max(1, waves.length);
        const contractValue =
          Number(plan.project_contract_value || 0) > 0
            ? Number(plan.project_contract_value)
            : Number(plan.total_estimated_budget || 0) * 1.45;

        const enrichedWaves = waves.map((w, idx) => {
          const batchRatio =
            Number(w.wot_batch_ratio || 0) > 0
              ? Number(w.wot_batch_ratio)
              : 1 / totalWaves;
          const waveContractShare = Math.round(contractValue * batchRatio);
          const fgLotQty =
            Number(w.target_fg_lot_qty) > 0
              ? Number(w.target_fg_lot_qty)
              : Math.max(
                  1,
                  Math.round(
                    Number(plan.master_lot_size || 10) *
                      Number(plan.wot_lots_per_wave || 1),
                  ),
                );
          const fgDeliveryDate =
            w.target_fg_delivery_date ||
            addDaysIso(
              w.production_need_date || w.target_arrival_date,
              3,
            );

          // Determine current stage in the 4-step Partial Delivery chain
          let stage: "MATERIAL_WAVE" | "FG_RELEASED" | "DO_DELIVERED" | "INVOICED" =
            "MATERIAL_WAVE";
          if (w.linked_ci_id || w.live_ci_number) {
            stage = "INVOICED";
          } else if (w.linked_dn_id || w.live_dn_number) {
            stage = "DO_DELIVERED";
          } else if (w.fgr_id || w.live_fgr_number || w.fg_delivery_status === "FG_READY") {
            stage = "FG_RELEASED";
          }

          return {
            wave_id: w.id,
            wave_number: w.wave_number,
            wave_name: w.wave_name,
            station_focus: w.station_focus,
            wot_lot_range: w.wot_lot_range || `Lot Batch #${idx + 1}`,
            wot_batch_ratio: batchRatio,
            material_status: w.status,
            target_order_date: w.target_order_date,
            target_arrival_date: w.target_arrival_date,
            production_need_date: w.production_need_date,
            target_fg_delivery_date: fgDeliveryDate,
            target_fg_lot_qty: fgLotQty,
            estimated_material_cost: Number(w.estimated_cost || 0),
            estimated_billing_value: waveContractShare,
            stage,
            fgr_id: w.fgr_id || null,
            fgr_number: w.live_fgr_number || w.fgr_number || null,
            fgr_qty: Number(w.fgr_qty || fgLotQty),
            fgr_status: w.fgr_status || null,
            fgr_created_at: w.fgr_created_at || null,
            linked_dn_id: w.linked_dn_id || null,
            linked_dn_number: w.live_dn_number || w.linked_dn_number || null,
            dn_status: w.dn_status || null,
            dn_delivered_at: w.dn_delivered_at || null,
            linked_ci_id: w.linked_ci_id || null,
            linked_ci_number: w.live_ci_number || w.linked_ci_number || null,
            ci_amount: Number(w.ci_grand_total || w.ci_amount || 0),
            ci_status: w.ci_status || null,
            ci_billing_mode: w.ci_billing_mode || null,
          };
        });

        const summary = {
          total_waves: enrichedWaves.length,
          fg_released_waves: enrichedWaves.filter((w) => w.stage !== "MATERIAL_WAVE").length,
          do_delivered_waves: enrichedWaves.filter(
            (w) => w.stage === "DO_DELIVERED" || w.stage === "INVOICED",
          ).length,
          invoiced_waves: enrichedWaves.filter((w) => w.stage === "INVOICED").length,
          ready_for_consolidated_invoice_count: enrichedWaves.filter(
            (w) => w.stage === "DO_DELIVERED" && !w.linked_ci_id,
          ).length,
          total_fg_units_planned: enrichedWaves.reduce(
            (s, w) => s + Number(w.target_fg_lot_qty || 0),
            0,
          ),
          total_fg_units_delivered: enrichedWaves
            .filter((w) => w.stage === "DO_DELIVERED" || w.stage === "INVOICED")
            .reduce((s, w) => s + Number(w.fgr_qty || w.target_fg_lot_qty || 0), 0),
          total_project_contract_value: contractValue,
          total_invoiced_value: enrichedWaves
            .filter((w) => w.stage === "INVOICED")
            .reduce((s, w) => s + Number(w.estimated_billing_value || 0), 0),
        };

        res.json({
          plan_id: plan.id,
          plan_code: plan.plan_code,
          project_id: plan.project_id,
          project_name: plan.project_name || plan.project_title || plan.project_id,
          customer_id: plan.customer_id || "CUST-DEFAULT",
          customer_name: plan.customer_name || "Project Customer",
          spk_number: plan.spk_number || null,
          master_pr_id: plan.master_pr_id || null,
          master_pr_number: plan.master_pr_number || null,
          wot_header: wotHeader || null,
          wot_lots: wotLots,
          summary,
          waves: enrichedWaves,
        });
      } catch (error: any) {
        console.error("Failed to fetch partial delivery chain:", error);
        res.status(500).json({
          error: error.message || "Failed to fetch partial delivery chain",
        });
      }
    },
  );

  // 5j. Release WOT Lot Batch to Finished Goods (FG_READY) for Partial Delivery
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/:planId/waves/:waveId/release-wot-fg",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId, waveId } = req.params;
        const { fg_qty, target_warehouse, notes } = req.body || {};
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "QC-Inspector";

        const plan = db
          .prepare("SELECT * FROM procurement_plans WHERE id = ?")
          .get(planId) as any;
        const wave = db
          .prepare(
            "SELECT * FROM procurement_plan_waves WHERE id = ? AND plan_id = ?",
          )
          .get(waveId, planId) as any;

        if (!plan || !wave) {
          return res
            .status(404)
            .json({ error: "Procurement Plan or Wave not found" });
        }

        if (wave.fgr_id) {
          return res.json({
            success: true,
            fgr_id: wave.fgr_id,
            fgr_number: wave.fgr_number,
            message: `Finished Goods batch ${wave.fgr_number} is already released for Wave #${wave.wave_number}.`,
          });
        }

        const fgrId = "FGR-" + Math.random().toString(36).substring(2, 10);
        const dateToken = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const fgrNumber = `FGR-WOT-${dateToken}-W${wave.wave_number}-${Math.floor(100 + Math.random() * 900)}`;
        const releaseQty =
          Number(fg_qty) > 0
            ? Number(fg_qty)
            : Number(wave.target_fg_lot_qty) > 0
              ? Number(wave.target_fg_lot_qty)
              : Math.max(
                  1,
                  Math.round(
                    Number(plan.master_lot_size || 10) *
                      Number(plan.wot_lots_per_wave || 1),
                  ),
                );
        const itemCode = `FG-${plan.project_id}-W${wave.wave_number}`;
        const itemName = `${plan.project_name || plan.project_id} — Partial FG Batch (${wave.wot_lot_range || `Wave #${wave.wave_number}`})`;

        db.transaction(() => {
          db.prepare(
            `INSERT INTO finish_good_records (
               id, fgr_number, project_id, item_code, item_name,
               serial_number, quantity, uom, status, notes, inspected_by, target_warehouse
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SET', 'APPROVED', ?, ?, ?)`,
          ).run(
            fgrId,
            fgrNumber,
            plan.project_id,
            itemCode,
            itemName,
            `${plan.plan_code}-W${wave.wave_number}`,
            releaseQty,
            notes ||
              `WOT Partial FG Release for ${wave.wot_lot_range || `Wave #${wave.wave_number}`} (${wave.station_focus})`,
            username,
            target_warehouse || "WAREHOUSE_FG_1",
          );

          db.prepare(
            `UPDATE procurement_plan_waves
             SET fgr_id = ?,
                 fgr_number = ?,
                 target_fg_lot_qty = ?,
                 fg_delivery_status = 'FG_READY'
             WHERE id = ?`,
          ).run(fgrId, fgrNumber, releaseQty, waveId);
        })();

        logAudit(
          username,
          "RELEASE_WOT_PARTIAL_FG",
          "FINISH_GOOD_RECORD",
          fgrId,
          `Released WOT Lot Batch (${wave.wot_lot_range || `Wave #${wave.wave_number}`}) to Finished Goods ${fgrNumber} (${releaseQty} SET)`,
        );

        res.json({
          success: true,
          fgr_id: fgrId,
          fgr_number: fgrNumber,
          fg_qty: releaseQty,
          message: `WOT Lot Batch (${wave.wot_lot_range || `Wave #${wave.wave_number}`}) passed Final QC & released to FG Warehouse as ${fgrNumber}.`,
        });
      } catch (error: any) {
        console.error("Failed to release WOT FG:", error);
        res.status(500).json({
          error: error.message || "Failed to release WOT Lot to Finished Goods",
        });
      }
    },
  );

  // 5k. Issue Partial Delivery Order (DO / Surat Jalan Parsial) for a Wave WOT Batch
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/:planId/waves/:waveId/create-partial-do",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId, waveId } = req.params;
        const { police_number, remarks } = req.body || {};
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "Logistics";

        const plan = db
          .prepare(
            `SELECT p.*, prj.customer_id, prj.title as project_title
             FROM procurement_plans p
             LEFT JOIN projects prj ON p.project_id = prj.id
             WHERE p.id = ?`,
          )
          .get(planId) as any;
        const wave = db
          .prepare(
            "SELECT * FROM procurement_plan_waves WHERE id = ? AND plan_id = ?",
          )
          .get(waveId, planId) as any;

        if (!plan || !wave) {
          return res
            .status(404)
            .json({ error: "Procurement Plan or Wave not found" });
        }

        if (wave.linked_dn_id) {
          return res.json({
            success: true,
            dn_id: wave.linked_dn_id,
            dn_number: wave.linked_dn_number,
            message: `Partial Delivery Order ${wave.linked_dn_number} is already issued for Wave #${wave.wave_number}.`,
          });
        }

        // Resolve valid customer_id
        let customerId = plan.customer_id;
        if (!customerId) {
          const firstCustomer = db
            .prepare("SELECT id FROM customers ORDER BY created_at ASC LIMIT 1")
            .get() as { id: string } | undefined;
          if (firstCustomer) {
            customerId = firstCustomer.id;
          } else {
            customerId = "CUST-DEFAULT";
            db.prepare(
              "INSERT OR IGNORE INTO customers (id, name, address, phone, email) VALUES (?, 'Industrial Project Client', 'Kawasan Industri Jababeka', '021-890000', 'client@industrial.co.id')",
            ).run(customerId);
          }
        }

        const dnId = "DN-" + Math.random().toString(36).substring(2, 10);
        const dateToken = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const dnNumber = `DO-PART-${dateToken}-W${wave.wave_number}-${Math.floor(100 + Math.random() * 900)}`;
        const deliveryQty =
          Number(wave.target_fg_lot_qty) > 0
            ? Number(wave.target_fg_lot_qty)
            : Math.max(
                1,
                Math.round(
                  Number(plan.master_lot_size || 10) *
                    Number(plan.wot_lots_per_wave || 1),
                ),
              );

        // Ensure an item exists in `items` for delivery_items foreign key
        const fgItemId = `FG-ITEM-${plan.project_id}`;
        db.prepare(
          `INSERT OR IGNORE INTO items (id, code, name, category, stock, uom, unit_price)
           VALUES (?, ?, ?, 'FINISH_GOOD', ?, 'SET', ?)`,
        ).run(
          fgItemId,
          `FG-${plan.project_id}`,
          `${plan.project_name || plan.project_title || plan.project_id} — Finished Goods Assembly`,
          deliveryQty,
          Number(wave.estimated_cost || 0),
        );

        db.transaction(() => {
          // Auto-release FG if not yet released
          let fgrId = wave.fgr_id;
          let fgrNumber = wave.fgr_number;
          if (!fgrId) {
            fgrId = "FGR-" + Math.random().toString(36).substring(2, 10);
            fgrNumber = `FGR-WOT-${dateToken}-W${wave.wave_number}-${Math.floor(100 + Math.random() * 900)}`;
            db.prepare(
              `INSERT INTO finish_good_records (
                 id, fgr_number, project_id, item_code, item_name,
                 serial_number, quantity, uom, status, notes, inspected_by, target_warehouse
               ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SET', 'APPROVED', ?, ?, 'WAREHOUSE_FG_1')`,
            ).run(
              fgrId,
              fgrNumber,
              plan.project_id,
              `FG-${plan.project_id}-W${wave.wave_number}`,
              `${plan.project_name || plan.project_id} — Partial FG (${wave.wot_lot_range || `Wave #${wave.wave_number}`})`,
              `${plan.plan_code}-W${wave.wave_number}`,
              deliveryQty,
              `Auto-released with Partial DO ${dnNumber}`,
              username,
            );
          }

          db.prepare(
            `INSERT INTO delivery_notes (
               id, dn_number, customer_id, project_id, status,
               authorized_by, police_number, shipped_at, delivered_at, remarks,
               is_partial, delivery_type, wave_id, wave_number, wot_lot_range, fgr_id
             ) VALUES (?, ?, ?, ?, 'DELIVERED', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 1, 'PARTIAL', ?, ?, ?, ?)`,
          ).run(
            dnId,
            dnNumber,
            customerId,
            plan.project_id,
            username,
            police_number || "B 9421 KXA",
            remarks ||
              `Partial Delivery for ${wave.wot_lot_range || `Wave #${wave.wave_number}`} (${deliveryQty} SET) — Ref Plan ${plan.plan_code}`,
            waveId,
            wave.wave_number,
            wave.wot_lot_range || `Wave #${wave.wave_number}`,
            fgrId,
          );

          db.prepare(
            `INSERT INTO delivery_items (id, dn_id, item_id, qty, uom, remarks)
             VALUES (?, ?, ?, ?, 'SET', ?)`,
          ).run(
            "DNI-" + Math.random().toString(36).substring(2, 10),
            dnId,
            fgItemId,
            deliveryQty,
            `Partial Shipment ${wave.wot_lot_range || `Wave #${wave.wave_number}`} (${fgrNumber})`,
          );

          db.prepare(
            `UPDATE procurement_plan_waves
             SET fgr_id = COALESCE(fgr_id, ?),
                 fgr_number = COALESCE(fgr_number, ?),
                 linked_dn_id = ?,
                 linked_dn_number = ?,
                 fg_delivery_status = 'DO_DELIVERED'
             WHERE id = ?`,
          ).run(fgrId, fgrNumber, dnId, dnNumber, waveId);
        })();

        logAudit(
          username,
          "CREATE_PARTIAL_DO",
          "DELIVERY_NOTE",
          dnId,
          `Issued Partial Delivery Order ${dnNumber} for ${wave.wot_lot_range || `Wave #${wave.wave_number}`} (${deliveryQty} SET)`,
        );

        res.json({
          success: true,
          dn_id: dnId,
          dn_number: dnNumber,
          message: `Partial Delivery Order ${dnNumber} issued & delivered for ${wave.wot_lot_range || `Wave #${wave.wave_number}`}.`,
        });
      } catch (error: any) {
        console.error("Failed to create partial DO:", error);
        res.status(500).json({
          error: error.message || "Failed to create Partial Delivery Order",
        });
      }
    },
  );

  // 5l. Flexible Customer Invoicing for Partial Delivery (Single DO Immediate OR Consolidated Multi-DO Invoice)
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/:planId/create-partial-invoice",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId } = req.params;
        const { billing_mode, wave_ids, payment_terms, ppn_rate } = req.body || {};
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "Finance";

        const mode: "SINGLE_DO" | "CONSOLIDATED_DO" =
          billing_mode === "CONSOLIDATED_DO" ? "CONSOLIDATED_DO" : "SINGLE_DO";

        const plan = db
          .prepare(
            `SELECT p.*, prj.customer_id, prj.title as project_title, prj.value as project_contract_value
             FROM procurement_plans p
             LEFT JOIN projects prj ON p.project_id = prj.id
             WHERE p.id = ?`,
          )
          .get(planId) as any;

        if (!plan) {
          return res.status(404).json({ error: "Procurement Plan not found" });
        }

        const allWaves = db
          .prepare(
            "SELECT * FROM procurement_plan_waves WHERE plan_id = ? ORDER BY wave_number ASC",
          )
          .all(planId) as any[];

        const requestedWaveIds: string[] = Array.isArray(wave_ids)
          ? wave_ids
          : [];
        const targetWaves = allWaves.filter((w) =>
          requestedWaveIds.length > 0
            ? requestedWaveIds.includes(w.id)
            : Boolean(w.linked_dn_id && !w.linked_ci_id),
        );

        if (targetWaves.length === 0) {
          return res.status(400).json({
            error:
              "Select at least one delivered Partial DO wave that has not been invoiced yet.",
          });
        }

        const missingDoWave = targetWaves.find((w) => !w.linked_dn_id);
        if (missingDoWave) {
          return res.status(400).json({
            error: `Wave #${missingDoWave.wave_number} does not have a Partial Delivery Order (DO) yet. Issue Partial DO before invoicing.`,
          });
        }

        const alreadyInvoicedWave = targetWaves.find((w) => Boolean(w.linked_ci_id));
        if (alreadyInvoicedWave) {
          return res.status(400).json({
            error: `Wave #${alreadyInvoicedWave.wave_number} is already invoiced under ${alreadyInvoicedWave.linked_ci_number}.`,
          });
        }

        // Resolve valid customer_id
        let customerId = plan.customer_id;
        if (!customerId) {
          const firstCustomer = db
            .prepare("SELECT id FROM customers ORDER BY created_at ASC LIMIT 1")
            .get() as { id: string } | undefined;
          customerId = firstCustomer?.id || "CUST-DEFAULT";
        }

        const totalWavesCount = Math.max(1, allWaves.length);
        const contractValue =
          Number(plan.project_contract_value || 0) > 0
            ? Number(plan.project_contract_value)
            : Number(plan.total_estimated_budget || 0) * 1.45;

        let dppAmount = 0;
        for (const tw of targetWaves) {
          const ratio =
            Number(tw.wot_batch_ratio || 0) > 0
              ? Number(tw.wot_batch_ratio)
              : 1 / totalWavesCount;
          dppAmount += Math.round(contractValue * ratio);
        }

        const taxRate = Number.isFinite(Number(ppn_rate)) ? Number(ppn_rate) : 11;
        const ppnAmount = Math.round(dppAmount * (taxRate / 100));
        const grandTotal = dppAmount + ppnAmount;

        const ciId = "CI-" + Math.random().toString(36).substring(2, 10);
        const dateToken = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const ciPrefix = mode === "CONSOLIDATED_DO" ? "INV-CONS" : "INV-PART";
        const ciNumber = `${ciPrefix}-${dateToken}-${Math.floor(1000 + Math.random() * 9000)}`;

        const primaryDnId = targetWaves[0].linked_dn_id;
        const dnIds = targetWaves.map((w) => w.linked_dn_id);
        const dnNumbers = targetWaves.map((w) => w.linked_dn_number);
        const waveLabels = targetWaves
          .map((w) => `Wave #${w.wave_number} (${w.wot_lot_range || "Lot Batch"})`)
          .join(", ");

        db.transaction(() => {
          db.prepare(
            `INSERT INTO commercial_invoices (
               id, ci_number, dn_id, customer_id, project_id,
               amount, status, payment_terms, job_description,
               payment_status, ppn, ppn_rate, total_amount, gross_amount, dpp, grand_total,
               sales_channel, billing_mode, consolidated_dn_ids_json, consolidated_dn_numbers_json, wave_ids_json
             ) VALUES (?, ?, ?, ?, ?, ?, 'UNPAID', ?, ?, 'UNPAID', ?, ?, ?, ?, ?, ?, 'B2B_PROJECT', ?, ?, ?, ?)`,
          ).run(
            ciId,
            ciNumber,
            primaryDnId,
            customerId,
            plan.project_id,
            grandTotal,
            payment_terms || "Net 30",
            `${mode === "CONSOLIDATED_DO" ? "Consolidated Partial Delivery Invoice" : "Partial Delivery Invoice"} — ${plan.project_name || plan.project_id}: ${waveLabels} [DO: ${dnNumbers.join(", ")}]`,
            ppnAmount,
            taxRate,
            grandTotal,
            dppAmount,
            dppAmount,
            grandTotal,
            mode,
            JSON.stringify(dnIds),
            JSON.stringify(dnNumbers),
            JSON.stringify(targetWaves.map((w) => w.id)),
          );

          for (const tw of targetWaves) {
            db.prepare(
              `UPDATE procurement_plan_waves
               SET linked_ci_id = ?,
                   linked_ci_number = ?,
                   fg_delivery_status = 'INVOICED'
               WHERE id = ?`,
            ).run(ciId, ciNumber, tw.id);

            db.prepare(
              `UPDATE delivery_notes
               SET invoiced_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
            ).run(tw.linked_dn_id);
          }
        })();

        logAudit(
          username,
          "CREATE_PARTIAL_INVOICE",
          "COMMERCIAL_INVOICE",
          ciId,
          `Created ${mode} Commercial Invoice ${ciNumber} (${grandTotal.toLocaleString("id-ID")}) for DO(s): ${dnNumbers.join(", ")}`,
        );

        res.json({
          success: true,
          ci_id: ciId,
          ci_number: ciNumber,
          billing_mode: mode,
          dpp_amount: dppAmount,
          ppn_amount: ppnAmount,
          grand_total: grandTotal,
          invoiced_waves: targetWaves.map((w) => w.wave_number),
          invoiced_dn_numbers: dnNumbers,
          message: `${mode === "CONSOLIDATED_DO" ? "Consolidated Multi-DO Invoice" : "Partial DO Invoice"} ${ciNumber} issued for ${dnNumbers.join(", ")}.`,
        });
      } catch (error: any) {
        console.error("Failed to create partial invoice:", error);
        res.status(500).json({
          error: error.message || "Failed to create Customer Invoice",
        });
      }
    },
  );

  // 6. Convert Wave into Multi-Vendor Purchase Orders (Auto-split by Item Vendor)
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/:planId/waves/:waveId/execute",
    requireRole(["PURCHASING", "ADMIN", "SUPERADMIN", "FC", "BOD", "DIRECTOR"]),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const { planId, waveId } = req.params;
        const {
          item_supplier_overrides = {},
          fallback_supplier_id,
          urgency = "NORMAL",
          ppn_rate = 12,
          pph_rate = 0,
        } = req.body || {};

        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "Purchasing";

        const plan = db
          .prepare("SELECT * FROM procurement_plans WHERE id = ?")
          .get(planId) as any;
        if (!plan) {
          return res.status(404).json({ error: "Procurement Plan not found" });
        }

        const wave = db
          .prepare(
            "SELECT * FROM procurement_plan_waves WHERE id = ? AND plan_id = ?",
          )
          .get(waveId, planId) as any;
        if (!wave) {
          return res.status(404).json({ error: "Wave not found in this plan" });
        }
        if (wave.status !== "PLANNED") {
          return res.status(400).json({
            error: `Wave ${wave.wave_number} has already been converted (${wave.status}).`,
          });
        }

        const waveItems = db
          .prepare(
            "SELECT * FROM procurement_plan_items WHERE wave_id = ? AND plan_id = ?",
          )
          .all(waveId, planId) as any[];
        if (waveItems.length === 0) {
          return res.status(400).json({
            error: "Cannot convert an empty wave with no allocated items.",
          });
        }

        const defaultVendorRow = db
          .prepare("SELECT * FROM suppliers ORDER BY name ASC LIMIT 1")
          .get() as any;

        const vendorGroups = new Map<
          string,
          {
            supplier_id: string | null;
            supplier_name: string;
            supplier_npwp: string | null;
            tax_scheme: TaxScheme;
            payment_terms: string;
            items: any[];
          }
        >();

        for (const wItem of waveItems) {
          const requestedSupId =
            item_supplier_overrides[wItem.id] ||
            wItem.preferred_supplier_id ||
            fallback_supplier_id ||
            defaultVendorRow?.id ||
            null;

          let supObj: any = null;
          if (requestedSupId) {
            supObj = db
              .prepare("SELECT * FROM suppliers WHERE id = ?")
              .get(requestedSupId);
          }
          if (!supObj && defaultVendorRow) {
            supObj = defaultVendorRow;
          }

          const groupKey = supObj?.id || "DEFAULT_VENDOR";
          const existingGroup = vendorGroups.get(groupKey) || {
            supplier_id: supObj?.id || null,
            supplier_name:
              supObj?.name ||
              wItem.preferred_supplier_name ||
              "Preferred Supplier",
            supplier_npwp: supObj?.npwp || null,
            tax_scheme: (supObj?.tax_scheme as TaxScheme) || "DPP_NILAI_LAIN",
            payment_terms: supObj?.payment_terms || "Net 30 Days",
            items: [],
          };

          existingGroup.items.push(wItem);
          vendorGroups.set(groupKey, existingGroup);
        }

        const createdPos: {
          po_id: string;
          po_number: string;
          supplier_id: string | null;
          supplier_name: string;
          item_count: number;
          grand_total: number;
        }[] = [];

        const txPo = db.transaction(() => {
          for (const group of vendorGroups.values()) {
            const poId = "PO-" + Math.random().toString(36).substring(2, 10);
            const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

            db.prepare(
              `INSERT INTO purchase_orders (
                 id, po_number, supplier_id, supplier_name, supplier_npwp,
                 expected_date, status, urgency, tax_category, tax_scheme,
                 ppn_rate, pph_rate, payment_terms
               ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFTED', ?, 'GOODS_DPP_LAIN', ?, ?, ?, ?)`,
            ).run(
              poId,
              poNumber,
              group.supplier_id,
              group.supplier_name,
              group.supplier_npwp,
              wave.target_arrival_date,
              urgency,
              group.tax_scheme,
              group.tax_scheme === "NON_PKP" ? 0 : Number(ppn_rate) || 12,
              Number(pph_rate) || 0,
              group.payment_terms,
            );

            let dppTotal = 0;
            const touchedPrIds = new Set<string>();

            for (const wItem of group.items) {
              const allocQty = Math.max(
                0.01,
                Number(wItem.allocated_wave_qty || 1),
              );

              const vendorPriceRow =
                group.supplier_id && wItem.item_id
                  ? (db
                      .prepare(
                        "SELECT unit_price FROM item_supplier_prices WHERE item_id = ? AND supplier_id = ? AND unit_price > 0",
                      )
                      .get(wItem.item_id, group.supplier_id) as
                      | { unit_price: number }
                      | undefined)
                  : undefined;

              const finalUnitPrice =
                vendorPriceRow?.unit_price !== undefined
                  ? Number(vendorPriceRow.unit_price)
                  : Math.max(0, Number(wItem.unit_price || 0));

              dppTotal += allocQty * finalUnitPrice;

              const linkedPri = wItem.source_pr_item_id
                ? (db
                    .prepare(
                      "SELECT * FROM pr_items WHERE id = ? AND po_id IS NULL",
                    )
                    .get(wItem.source_pr_item_id) as any)
                : null;

              if (linkedPri) {
                touchedPrIds.add(linkedPri.pr_id);
                const currentPriQty = Number(linkedPri.qty || 0);
                if (currentPriQty > allocQty + 0.0001) {
                  const remainderQty = Number(
                    (currentPriQty - allocQty).toFixed(4),
                  );
                  db.prepare("UPDATE pr_items SET qty = ? WHERE id = ?").run(
                    remainderQty,
                    linkedPri.id,
                  );

                  const splitPriId =
                    "PRI-" + Math.random().toString(36).substring(2, 10);
                  db.prepare(
                    `INSERT INTO pr_items (
                       id, pr_id, item_id, dimension, spec, qty, unit_price, po_id,
                       expected_delivery_date, plan_id, plan_wave_id, parent_pr_item_id
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  ).run(
                    splitPriId,
                    linkedPri.pr_id,
                    wItem.item_id,
                    wItem.dimension || linkedPri.dimension || "",
                    wItem.spec || linkedPri.spec || "",
                    allocQty,
                    finalUnitPrice,
                    poId,
                    wave.target_arrival_date,
                    planId,
                    waveId,
                    linkedPri.parent_pr_item_id || linkedPri.id,
                  );

                  db.prepare(
                    "UPDATE procurement_plan_items SET source_pr_item_id = ? WHERE id = ?",
                  ).run(splitPriId, wItem.id);
                } else {
                  db.prepare(
                    `UPDATE pr_items
                     SET po_id = ?,
                         qty = ?,
                         unit_price = ?,
                         expected_delivery_date = ?,
                         plan_id = ?,
                         plan_wave_id = ?
                     WHERE id = ?`,
                  ).run(
                    poId,
                    allocQty,
                    finalUnitPrice,
                    wave.target_arrival_date,
                    planId,
                    waveId,
                    linkedPri.id,
                  );
                }
              }

              db.prepare(
                `UPDATE procurement_plan_items
                 SET preferred_supplier_id = ?,
                     preferred_supplier_name = ?,
                     unit_price = ?,
                     subtotal_cost = ?,
                     generated_po_id = ?,
                     generated_po_number = ?
                 WHERE id = ?`,
              ).run(
                group.supplier_id,
                group.supplier_name,
                finalUnitPrice,
                allocQty * finalUnitPrice,
                poId,
                poNumber,
                wItem.id,
              );
            }

            for (const prId of touchedPrIds) {
              const remCount = (
                db
                  .prepare(
                    "SELECT COUNT(*) as c FROM pr_items WHERE pr_id = ? AND po_id IS NULL",
                  )
                  .get(prId) as { c: number }
              ).c;
              db.prepare(
                "UPDATE purchase_requests SET status = ? WHERE id = ?",
              ).run(remCount === 0 ? "ORDERED" : "PARTIAL_ORDERED", prId);
            }

            const effectivePpn =
              group.tax_scheme === "NON_PKP" ? 0 : Number(ppn_rate) || 12;
            const breakdown = calculateFinancialBreakdown({
              dpp: dppTotal,
              taxRate: effectivePpn,
              pphRate: Number(pph_rate) || 0,
              taxScheme: group.tax_scheme,
              roundingFactor: 0,
            });

            db.prepare(
              `UPDATE purchase_orders
               SET total_amount = ?, dpp = ?, dpp_nilai_lain = ?, ppn = ?, pph = ?, grand_total = ?
               WHERE id = ?`,
            ).run(
              breakdown.dpp,
              breakdown.dpp,
              breakdown.dppNilaiLain,
              breakdown.ppnAmount,
              breakdown.pphAmount,
              breakdown.grandTotal,
              poId,
            );

            outboxService.enqueue(
              db,
              "PURCHASE_ORDERS",
              poId,
              "CREATE",
              {
                id: poId,
                po_number: poNumber,
                status: "DRAFTED",
                supplier_id: group.supplier_id,
                total_amount: breakdown.grandTotal,
                grand_total: breakdown.grandTotal,
                created_at: new Date().toISOString(),
              },
              "BOTH",
            );

            createdPos.push({
              po_id: poId,
              po_number: poNumber,
              supplier_id: group.supplier_id,
              supplier_name: group.supplier_name,
              item_count: group.items.length,
              grand_total: breakdown.grandTotal,
            });
          }

          const firstPo = createdPos[0];
          const allPoNumbers = createdPos.map((p) => p.po_number).join(", ");

          db.prepare(
            `UPDATE procurement_plan_waves
             SET status = 'PO_DRAFTED',
                 generated_po_id = ?,
                 generated_po_number = ?,
                 generated_pos_json = ?,
                 executed_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).run(
            firstPo?.po_id || null,
            allPoNumbers || null,
            JSON.stringify(createdPos),
            waveId,
          );

          const remainingWaves = db
            .prepare(
              "SELECT COUNT(*) as c FROM procurement_plan_waves WHERE plan_id = ? AND status = 'PLANNED'",
            )
            .get(planId) as { c: number };

          db.prepare(
            `UPDATE procurement_plans
             SET status = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).run(
            remainingWaves.c === 0 ? "COMPLETED" : "PARTIAL_EXECUTED",
            planId,
          );
        });

        txPo();

        logAudit(
          username,
          "EXECUTE_PLAN_WAVE_PO",
          "PROCUREMENT_PLAN",
          planId,
          `Converted ${plan.plan_code} Wave ${wave.wave_number} into ${createdPos.length} Draft PO(s): ${createdPos.map((p) => `${p.po_number} (${p.supplier_name})`).join(", ")}`,
        );

        res.json({
          success: true,
          po_id: createdPos[0]?.po_id,
          po_number: createdPos[0]?.po_number,
          created_pos: createdPos,
          message:
            createdPos.length === 1
              ? `Draft PO ${createdPos[0].po_number} (${createdPos[0].supplier_name}) created for Wave ${wave.wave_number}`
              : `Created ${createdPos.length} Draft POs by vendor for Wave ${wave.wave_number}: ${createdPos.map((p) => p.po_number).join(", ")}`,
        });
      } catch (error: any) {
        console.error("Failed to convert procurement plan wave:", error);
        res.status(500).json({
          error: error.message || "Failed to convert wave to Purchase Order",
        });
      }
    },
  );

  // 7. Cancel / Archive a Procurement Plan & Rollback Remaining Locked PR Items
  purchasingRouter.delete(
    "/api/purchasing/procurement-plans/:id",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const planId = req.params.id;
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "Purchasing";

        db.transaction(() => {
          rollbackPrItemsForPlanOrWave({ planId });

          db.prepare(
            "UPDATE procurement_plans SET status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(planId);
        })();

        logAudit(
          username,
          "CANCEL_PROCUREMENT_PLAN",
          "PROCUREMENT_PLAN",
          planId,
          `Cancelled/Archived Procurement Plan ${planId} and returned remaining PR quantities to active queue`,
        );

        res.json({
          success: true,
          message:
            "Procurement Plan cancelled. Remaining PR quantities returned to active queue.",
        });
      } catch (error: any) {
        console.error("Failed to archive procurement plan:", error);
        res.status(500).json({ error: "Failed to cancel procurement plan" });
      }
    },
  );

  // 7b. Reset All Active Procurement Plans to 0 & Return All Unexecuted PR Items to Queue
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/reset-all",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "Purchasing";

        const activePlans = db
          .prepare(
            "SELECT id, plan_code FROM procurement_plans WHERE status != 'ARCHIVED'",
          )
          .all() as { id: string; plan_code: string }[];

        let resetCount = 0;
        db.transaction(() => {
          for (const p of activePlans) {
            rollbackPrItemsForPlanOrWave({ planId: p.id });
            db.prepare(
              "UPDATE procurement_plans SET status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(p.id);
            resetCount++;
          }
        })();

        if (resetCount > 0) {
          logAudit(
            username,
            "RESET_ALL_PROCUREMENT_PLANS",
            "PROCUREMENT_PLAN",
            "ALL",
            `Reset ${resetCount} active procurement plan(s) to 0 and returned all unexecuted PR quantities to active queue`,
          );
        }

        res.json({
          ok: true,
          reset_count: resetCount,
          message: `Reset ${resetCount} procurement plan(s) to 0. All unexecuted PR items returned to active queue.`,
        });
      } catch (error: any) {
        console.error("Failed to reset all procurement plans:", error);
        res.status(500).json({
          error: error.message || "Failed to reset procurement plans",
        });
      }
    },
  );

  // 8. Get Cross-Module Project Procurement & Setup Master Sync Status
  purchasingRouter.get(
    "/api/purchasing/procurement-plans/project-status/:projectId",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const projectId = String(req.params.projectId || "");
        if (!projectId) {
          return res.status(400).json({ error: "projectId is required" });
        }

        const { project, masterSchedule, bopSteps, stationClusters, items } =
          resolveProjectManufacturingContext(projectId);
        const actualProjectId = project.id || projectId;
        const todayIso = new Date().toISOString().split("T")[0];

        let activePlan = db
          .prepare(
            `SELECT * FROM procurement_plans
             WHERE (project_id = ? OR spk_number = ?)
               AND status != 'ARCHIVED'
             ORDER BY created_at DESC
             LIMIT 1`,
          )
          .get(
            actualProjectId,
            project.resolved_spk_number || project.spk_number || actualProjectId,
          ) as any;

        let waves: any[] = [];
        let planItems: any[] = [];
        if (activePlan) {
          const preWaves = db
            .prepare(
              `SELECT id, status FROM procurement_plan_waves WHERE plan_id = ?`,
            )
            .all(activePlan.id) as { id: string; status: string }[];
          for (const pw of preWaves) {
            if (pw.status !== "PLANNED") {
              reconcileWaveAndPlanLifecycleByWaveId(pw.id);
            }
          }

          activePlan = db
            .prepare("SELECT * FROM procurement_plans WHERE id = ?")
            .get(activePlan.id) as any;

          waves = db
            .prepare(
              `SELECT * FROM procurement_plan_waves
               WHERE plan_id = ?
               ORDER BY wave_number ASC`,
            )
            .all(activePlan.id) as any[];
          planItems = db
            .prepare(
              `SELECT * FROM procurement_plan_items
               WHERE plan_id = ?
               ORDER BY wave_number ASC, step_sequence ASC`,
            )
            .all(activePlan.id) as any[];
        }

        const wave1Raw = waves[0] || null;
        const wave1Items = wave1Raw
          ? planItems.filter((it) => it.wave_id === wave1Raw.id)
          : [];
        const wave1MaxLeadTime =
          wave1Items.length > 0
            ? wave1Items.reduce(
                (m, it) => Math.max(m, Number(it.lead_time_days || 4)),
                4,
              )
            : items.reduce(
                (m, it) => Math.max(m, Number(it.lead_time_days || 4)),
                4,
              );

        const bufferDays = Number(activePlan?.lead_time_buffer_days || 3);
        const earliestFeasibleArrivalDate = addDaysIso(
          todayIso,
          wave1MaxLeadTime,
        );
        const earliestFeasibleNeedDate = addDaysIso(
          earliestFeasibleArrivalDate,
          bufferDays,
        );

        const wave1 = wave1Raw
          ? {
              id: wave1Raw.id,
              wave_number: wave1Raw.wave_number,
              wave_name: wave1Raw.wave_name,
              station_focus: wave1Raw.station_focus,
              wot_lot_range: wave1Raw.wot_lot_range || null,
              priority_focus: normalizePriorityTier(wave1Raw.priority_focus),
              status: wave1Raw.status,
              target_order_date: wave1Raw.target_order_date,
              target_arrival_date: wave1Raw.target_arrival_date,
              production_need_date: wave1Raw.production_need_date,
              generated_po_number: wave1Raw.generated_po_number || null,
              is_grn_received: wave1Raw.status === "GRN_RECEIVED",
              is_expedite_required:
                wave1Raw.status === "PLANNED" &&
                wave1Raw.target_order_date < todayIso,
            }
          : null;

        const executedWavesCount = waves.filter(
          (w) => w.status !== "PLANNED",
        ).length;

        const masterStartDate = masterSchedule.master_start_date;
        const masterEndDate = masterSchedule.master_end_date;

        const isHorizonDrifted = Boolean(
          activePlan &&
            masterStartDate &&
            wave1 &&
            wave1.status === "PLANNED" &&
            String(wave1.production_need_date).slice(0, 10) !==
              String(masterStartDate).slice(0, 10),
        );

        res.json({
          ok: true,
          project_id: actualProjectId,
          project_name: project.name || actualProjectId,
          spk_number:
            project.resolved_spk_number || project.spk_number || null,
          is_master_set: Boolean(project.is_master_set),
          bop_status: project.bop_status || "PENDING",
          master_start_date: masterStartDate,
          master_end_date: masterEndDate,
          target_order_qty: masterSchedule.target_order_qty,
          master_lot_size: masterSchedule.master_lot_size,
          total_wot_lots: masterSchedule.total_wot_lots,
          bop_steps_count: bopSteps.length,
          station_clusters_count: stationClusters.length,
          has_active_plan: Boolean(activePlan),
          plan_id: activePlan?.id || null,
          plan_code: activePlan?.plan_code || null,
          plan_status: activePlan?.status || null,
          strategy_mode: activePlan
            ? normalizeStrategyMode(activePlan.strategy_mode)
            : null,
          total_waves: activePlan
            ? Number(activePlan.total_waves || waves.length)
            : 0,
          executed_waves_count: executedWavesCount,
          wave_interval_days: activePlan
            ? Number(activePlan.wave_interval_days || 0)
            : 0,
          lead_time_buffer_days: bufferDays,
          total_estimated_budget: activePlan
            ? Number(activePlan.total_estimated_budget || 0)
            : items.reduce((s, it) => s + it.qty * it.unit_price, 0),
          wave1,
          is_wave1_grn_received: Boolean(wave1?.is_grn_received),
          pending_pr_items_count: items.length,
          max_lead_time_days: wave1MaxLeadTime,
          earliest_feasible_arrival_date: earliestFeasibleArrivalDate,
          earliest_feasible_need_date: earliestFeasibleNeedDate,
          is_horizon_drifted: isHorizonDrifted,
        });
      } catch (error: any) {
        console.error(
          "Failed to fetch project procurement sync status:",
          error,
        );
        res.status(500).json({
          error: "Failed to fetch project procurement sync status",
          details: error.message,
        });
      }
    },
  );

  // 9. Re-Sync Saved Procurement Plan Wave Dates with Production Setup & Master Station/WOT Schedule
  purchasingRouter.post(
    "/api/purchasing/procurement-plans/:id/sync-master-dates",
    requireRole(PROCUREMENT_PLAN_ROLES),
    (req, res) => {
      try {
        ensureProcurementPlanSchema();
        const planId = req.params.id;
        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "Purchasing";

        const result = syncPlanWavesWithMasterDatesByPlanId(planId, username);
        if (!result.ok) {
          return res.status(result.status || 400).json({ error: result.error });
        }

        res.json(result);
      } catch (error: any) {
        console.error("Failed to sync wave dates with master schedule:", error);
        res.status(500).json({
          error:
            error.message || "Failed to sync wave dates with master schedule",
        });
      }
    },
  );
}

/**
 * Re-computes each PLANNED wave's `production_need_date`, `target_arrival_date` (Station Start - Buffer),
 * and `target_order_date` directly from the latest Setup & Master Station Schedule and WOT Lot Cadence.
 */
export function syncPlanWavesWithMasterDatesByPlanId(
  planId: string,
  username = "System",
): {
  ok: boolean;
  status?: number;
  error?: string;
  plan_id?: string;
  plan_code?: string;
  wo_start_date?: string;
  wo_end_date?: string;
  wave_interval_days?: number;
  synced_waves_count?: number;
  message?: string;
} {
  ensureProcurementPlanSchema();
  const plan = db
    .prepare("SELECT * FROM procurement_plans WHERE id = ?")
    .get(planId) as any;
  if (!plan) {
    return { ok: false, status: 404, error: "Procurement Plan not found" };
  }

  const { masterSchedule, stationClusters, stepSchedules } =
    resolveProjectManufacturingContext(plan.project_id);

  const waves = db
    .prepare(
      "SELECT * FROM procurement_plan_waves WHERE plan_id = ? ORDER BY wave_number ASC",
    )
    .all(planId) as any[];

  if (waves.length === 0) {
    return { ok: false, status: 400, error: "No waves found in plan" };
  }

  const planItems = db
    .prepare("SELECT * FROM procurement_plan_items WHERE plan_id = ?")
    .all(planId) as any[];

  const bufferDays = Math.max(1, Number(plan.lead_time_buffer_days || 3));
  const stationById = new Map(stationClusters.map((c) => [c.station_id, c]));
  const stepById = new Map(stepSchedules.map((s) => [s.step_id, s]));

  let syncedWavesCount = 0;
  const updatedNeedDates: string[] = [];

  db.transaction(() => {
    for (let idx = 0; idx < waves.length; idx++) {
      const w = waves[idx];
      if (w.status !== "PLANNED") {
        updatedNeedDates.push(w.production_need_date);
        continue;
      }

      const wItems = planItems.filter((it) => it.wave_id === w.id);
      const maxLeadTime = wItems.reduce(
        (m, it) => Math.max(m, Number(it.lead_time_days || 4)),
        4,
      );

      // Determine earliest station start date among items in this wave from Setup Master
      let earliestStationDate = masterSchedule.master_start_date;
      const itemStationDates: string[] = [];

      wItems.forEach((it) => {
        if (it.bop_step_id && stepById.has(it.bop_step_id)) {
          itemStationDates.push(
            stepById.get(it.bop_step_id)!.station_start_date,
          );
        } else if (it.station_id && stationById.has(it.station_id)) {
          itemStationDates.push(stationById.get(it.station_id)!.start_date);
        } else if (it.step_sequence) {
          const matchedStep = stepSchedules.find(
            (s) => s.step_sequence === Number(it.step_sequence),
          );
          if (matchedStep) {
            itemStationDates.push(matchedStep.station_start_date);
          }
        }
      });

      if (itemStationDates.length > 0) {
        itemStationDates.sort();
        earliestStationDate = itemStationDates[0];
      } else if (w.station_id && stationById.has(w.station_id)) {
        earliestStationDate = stationById.get(w.station_id)!.start_date;
      } else if (idx > 0) {
        const fallbackOffset = Math.round(
          idx * Math.max(2, masterSchedule.wot_cadence_days || 3),
        );
        earliestStationDate = addDaysIso(
          masterSchedule.master_start_date,
          fallbackOffset,
        );
      }

      // Parse WOT lot start from wot_lot_range if present (e.g., "WOT Lot #3–#4")
      let wotLotOffsetDays = 0;
      const lotMatch = String(w.wot_lot_range || "").match(/#(\d+)/);
      if (lotMatch && Number(lotMatch[1]) > 1) {
        const startLotNum = Number(lotMatch[1]);
        wotLotOffsetDays = Math.round(
          (startLotNum - 1) * masterSchedule.wot_cadence_days,
        );
      }

      const prodNeedDate = addDaysIso(earliestStationDate, wotLotOffsetDays);
      const arrivalDate = addDaysIso(prodNeedDate, -bufferDays);
      const orderDate = addDaysIso(arrivalDate, -maxLeadTime);

      updatedNeedDates.push(prodNeedDate);

      db.prepare(
        `UPDATE procurement_plan_waves
         SET target_order_date = ?,
             target_arrival_date = ?,
             production_need_date = ?
         WHERE id = ?`,
      ).run(orderDate, arrivalDate, prodNeedDate, w.id);

      db.prepare(
        `UPDATE procurement_plan_items
         SET station_need_date = ?
         WHERE wave_id = ?`,
      ).run(prodNeedDate, w.id);

      db.prepare(
        `UPDATE pr_items
         SET expected_delivery_date = ?
         WHERE plan_wave_id = ? AND po_id IS NULL`,
      ).run(arrivalDate, w.id);

      syncedWavesCount++;
    }

    const avgInterval =
      updatedNeedDates.length <= 1
        ? 0
        : Math.max(
            1,
            Math.round(
              daysBetweenIso(
                updatedNeedDates[0],
                updatedNeedDates[updatedNeedDates.length - 1],
              ) / Math.max(1, updatedNeedDates.length - 1),
            ),
          );

    db.prepare(
      `UPDATE procurement_plans
       SET wave_interval_days = ?,
           master_lot_size = ?,
           total_wot_lots = ?,
           shift_hours = ?,
           factory_factor = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      avgInterval,
      masterSchedule.master_lot_size,
      masterSchedule.total_wot_lots,
      masterSchedule.shift_hours,
      masterSchedule.factory_factor,
      planId,
    );
  })();

  if (syncedWavesCount > 0) {
    logAudit(
      username,
      "SYNC_PLAN_WAVE_DATES",
      "PROCUREMENT_PLAN",
      planId,
      `Synchronized ${plan.plan_code} (${syncedWavesCount} PLANNED wave(s)) with Setup & Master Station Schedule (${masterSchedule.master_start_date} -> ${masterSchedule.master_end_date})`,
    );
  }

  return {
    ok: true,
    plan_id: planId,
    plan_code: plan.plan_code,
    wo_start_date: masterSchedule.master_start_date,
    wo_end_date: masterSchedule.master_end_date,
    wave_interval_days: Math.round(masterSchedule.wot_cadence_days || 3),
    synced_waves_count: syncedWavesCount,
    message: `Wave arrival & need dates synchronized to Setup Master Station Schedule (${masterSchedule.master_start_date} → ${masterSchedule.master_end_date})`,
  };
}

export function syncProjectPlannedWavesWithMasterDates(
  projectId: string,
  username = "System",
) {
  try {
    ensureProcurementPlanSchema();
    const { project } = resolveProjectManufacturingContext(projectId);
    const actualProjectId = project.id || projectId;

    const activePlan = db
      .prepare(
        `SELECT id FROM procurement_plans
         WHERE (project_id = ? OR spk_number = ?)
           AND status != 'ARCHIVED'
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(
        actualProjectId,
        project.resolved_spk_number || project.spk_number || actualProjectId,
      ) as { id: string } | undefined;

    if (!activePlan?.id) {
      return null;
    }

    return syncPlanWavesWithMasterDatesByPlanId(activePlan.id, username);
  } catch (err) {
    console.warn("Failed to auto-sync project planned waves on commit:", err);
    return null;
  }
}
