import { runCoreAndSystemMigrations } from "./01_core.ts";
import { runCrmSalesAndShopMigrations } from "./02_sales.ts";
import { runInventoryAndScmMigrations } from "./03_inventory.ts";
import { runProductionAndMesMigrations } from "./04_production.ts";
import { runFinanceAndAccountingMigrations } from "./05_finance.ts";
import { runHrisAndHcmMigrations } from "./06_hris.ts";

// Helper to safely execute schema migrations without noisy error logs for duplicate columns/indexes
export const safeExec = (targetDb: any, sql: string) => {
  try {
    if (typeof targetDb.exec === "function") {
      targetDb.exec(sql);
    } else if (typeof targetDb.prepare === "function") {
      targetDb.prepare(sql).run();
    }
  } catch (e: any) {
    // Silently ignore duplicate column/index or already applied migrations
    if (
      e.message &&
      (e.message.includes("duplicate column name") ||
        e.message.includes("already exists") ||
        e.message.includes("no such table") ||
        e.message.includes("no such column"))
    ) {
      return;
    }
  }
};

// Post-table creation migrations to safely alter columns on existing database instances
export function runPostTableMigrations(targetDb: any) {
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN item_type TEXT DEFAULT 'MATERIAL';");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN machine_category TEXT;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN capacity_per_hour REAL;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN machine_status TEXT DEFAULT 'AVAILABLE';");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN bypass_multi_station INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN serial_number TEXT;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN manufacturer TEXT;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN machine_specifications TEXT;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN alternative_machine_ids TEXT DEFAULT '[]';");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN operational_status TEXT DEFAULT 'AVAILABLE';");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN selling_price REAL;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN barcode TEXT;");

  safeExec(targetDb, "ALTER TABLE stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");
  safeExec(targetDb, "ALTER TABLE stations ADD COLUMN station_sequence INTEGER DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE stations ADD COLUMN station_code TEXT;");

  safeExec(targetDb, "ALTER TABLE production_stations ADD COLUMN station_sequence INTEGER DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE production_stations ADD COLUMN station_code TEXT;");
  safeExec(targetDb, "ALTER TABLE production_stations ADD COLUMN station_name TEXT;");
  safeExec(targetDb, "ALTER TABLE production_stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");

  safeExec(targetDb, "ALTER TABLE project_stations ADD COLUMN station_sequence INTEGER DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE project_stations ADD COLUMN station_code TEXT;");
  safeExec(targetDb, "ALTER TABLE project_stations ADD COLUMN station_name TEXT;");
  safeExec(targetDb, "ALTER TABLE project_stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");

  safeExec(targetDb, "ALTER TABLE processes ADD COLUMN cycle_time_minutes REAL;");
  safeExec(targetDb, "ALTER TABLE processes ADD COLUMN assigned_machine_id TEXT;");
  safeExec(targetDb, "ALTER TABLE processes ADD COLUMN alternative_machine_ids TEXT DEFAULT '[]';");
  safeExec(targetDb, "ALTER TABLE processes ADD COLUMN setup_time_minutes REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE processes ADD COLUMN teardown_time_minutes REAL DEFAULT 0;");

  safeExec(targetDb, "ALTER TABLE wots ADD COLUMN qr_payload TEXT;");
  safeExec(targetDb, "ALTER TABLE wots ADD COLUMN qr_image_url TEXT;");
  safeExec(targetDb, "ALTER TABLE wots ADD COLUMN machine_id TEXT;");
  safeExec(targetDb, "ALTER TABLE wots ADD COLUMN good_units INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE wots ADD COLUMN reject_units INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE wots ADD COLUMN rework_units INTEGER DEFAULT 0;");

  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN urgency TEXT DEFAULT 'NORMAL';");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN priority INTEGER DEFAULT 3;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN spk_number TEXT;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN lot_size REAL DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN qty REAL DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN factory_factor REAL DEFAULT 85;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN bom_status TEXT DEFAULT 'DRAFT';");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN bom_authorized_by TEXT;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN bom_authorized_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN bom_revision_note TEXT;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN bop_status TEXT DEFAULT 'DRAFT';");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN bop_authorized_by TEXT;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN bop_authorized_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN bop_revision_note TEXT;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN is_master_set INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN master_set_at DATETIME;");

  safeExec(targetDb, "ALTER TABLE work_centers ADD COLUMN code TEXT;");
  safeExec(targetDb, "ALTER TABLE work_centers ADD COLUMN efficiency_index REAL DEFAULT 1.0;");
  safeExec(targetDb, "ALTER TABLE work_centers ADD COLUMN status TEXT DEFAULT 'ACTIVE';");
  safeExec(targetDb, "ALTER TABLE work_centers ADD COLUMN wip_limit INTEGER DEFAULT 20;");
  safeExec(targetDb, "ALTER TABLE work_centers ADD COLUMN current_wip_count INTEGER DEFAULT 0;");

  safeExec(targetDb, "ALTER TABLE lot_routing_executions ADD COLUMN scrap_qty REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE lot_routing_executions ADD COLUMN good_qty REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE lot_routing_executions ADD COLUMN operator_name TEXT;");
  safeExec(targetDb, "ALTER TABLE lot_routing_executions ADD COLUMN end_time DATETIME;");
  safeExec(targetDb, "ALTER TABLE lot_routing_executions ADD COLUMN start_time DATETIME;");

  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN machine_id TEXT;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN affected_machine_id TEXT;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN ndp_number TEXT;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN ndp_code TEXT;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN reschedule_required INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN estimated_down_hours REAL DEFAULT 48;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN down_started_at DATETIME;");

  safeExec(targetDb, "ALTER TABLE ndps ADD COLUMN project_id TEXT;");
  safeExec(targetDb, "ALTER TABLE ndps ADD COLUMN reschedule_required INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE ndps ADD COLUMN affected_machine_id TEXT;");
  safeExec(targetDb, "ALTER TABLE ndps ADD COLUMN machine_id TEXT;");
  safeExec(targetDb, "ALTER TABLE ndps ADD COLUMN estimated_down_hours REAL DEFAULT 48;");
  safeExec(targetDb, "ALTER TABLE ndps ADD COLUMN down_started_at DATETIME;");

  safeExec(targetDb, "ALTER TABLE delivery_notes ADD COLUMN delivery_date TEXT;");
  safeExec(targetDb, "ALTER TABLE delivery_notes ADD COLUMN quotation_id TEXT;");
  safeExec(targetDb, "ALTER TABLE delivery_notes ADD COLUMN vehicle_plate TEXT;");
  safeExec(targetDb, "ALTER TABLE delivery_notes ADD COLUMN driver_name TEXT;");

  safeExec(targetDb, "ALTER TABLE delivery_items ADD COLUMN delivery_id TEXT;");
  safeExec(targetDb, "ALTER TABLE delivery_items ADD COLUMN item_code TEXT;");
  safeExec(targetDb, "ALTER TABLE delivery_items ADD COLUMN item_name TEXT;");
  safeExec(targetDb, "ALTER TABLE delivery_items ADD COLUMN qty_delivered REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE inventory ADD COLUMN min_stock REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE inventory ADD COLUMN max_stock REAL DEFAULT 0;");

  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN description TEXT;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN photo_urls TEXT;");
  safeExec(targetDb, "ALTER TABLE ndps ADD COLUMN bop_id TEXT;");
  safeExec(targetDb, "ALTER TABLE ndps ADD COLUMN station_id TEXT;");

  safeExec(targetDb, "ALTER TABLE material_dispatches ADD COLUMN station_id TEXT;");

  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN request_date TEXT;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN requested_by TEXT;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN notes TEXT;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN cancelled_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN archived INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN urgency TEXT DEFAULT 'NORMAL';");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN category TEXT DEFAULT 'PROJECT';");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN archived_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN revision_note TEXT;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN remarks TEXT;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN escalated_to TEXT;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN workflow_step_index INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN workflow_total_steps INTEGER DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN workflow_current_role TEXT DEFAULT 'SUPERVISOR';");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN step_started_at DATETIME;");

  safeExec(targetDb, "ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE users ADD COLUMN level TEXT DEFAULT 'STAFF';");
  safeExec(targetDb, "ALTER TABLE users ADD COLUMN last_seen_at TEXT;");
  safeExec(targetDb, "ALTER TABLE users ADD COLUMN device_type TEXT DEFAULT 'Desktop';");
  safeExec(targetDb, "ALTER TABLE hr_applications ADD COLUMN archived_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE hr_jobs ADD COLUMN archived_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE customers ADD COLUMN archived_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE customers ADD COLUMN contact_person TEXT;");
  safeExec(targetDb, "ALTER TABLE customers ADD COLUMN npwp TEXT;");
  safeExec(targetDb, "ALTER TABLE suppliers ADD COLUMN npwp TEXT;");
  safeExec(targetDb, "ALTER TABLE suppliers ADD COLUMN tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN';");
  safeExec(targetDb, "ALTER TABLE suppliers ADD COLUMN payment_terms TEXT DEFAULT 'Net 30 Days';");
  safeExec(targetDb, "ALTER TABLE quotations ADD COLUMN archived_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE quotations ADD COLUMN payment_terms TEXT;");
  safeExec(targetDb, "ALTER TABLE quotations ADD COLUMN payment_method TEXT;");
  safeExec(targetDb, "ALTER TABLE quotations ADD COLUMN tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN';");
  safeExec(targetDb, "ALTER TABLE quotations ADD COLUMN dpp_nilai_lain REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE quotations ADD COLUMN escalated_to TEXT;");
  safeExec(targetDb, "ALTER TABLE quotations ADD COLUMN workflow_step_index INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE quotations ADD COLUMN workflow_total_steps INTEGER DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE quotations ADD COLUMN workflow_current_role TEXT DEFAULT 'SALES_MANAGER';");
  safeExec(targetDb, "ALTER TABLE quotations ADD COLUMN step_started_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE purchase_orders ADD COLUMN tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN';");
  safeExec(targetDb, "ALTER TABLE purchase_orders ADD COLUMN dpp_nilai_lain REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE purchase_orders ADD COLUMN payment_terms TEXT DEFAULT 'Net 30 Days';");
  safeExec(targetDb, "ALTER TABLE purchase_orders ADD COLUMN supplier_npwp TEXT;");
  safeExec(targetDb, "ALTER TABLE purchase_orders ADD COLUMN rounding_factor REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE purchase_orders ADD COLUMN escalated_to TEXT;");
  safeExec(targetDb, "ALTER TABLE purchase_orders ADD COLUMN workflow_step_index INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE purchase_orders ADD COLUMN workflow_total_steps INTEGER DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE purchase_orders ADD COLUMN workflow_current_role TEXT DEFAULT 'PURCHASING_MANAGER';");
  safeExec(targetDb, "ALTER TABLE purchase_orders ADD COLUMN step_started_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE general_requests ADD COLUMN escalated_to TEXT;");
  safeExec(targetDb, "ALTER TABLE general_requests ADD COLUMN workflow_step_index INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE general_requests ADD COLUMN workflow_total_steps INTEGER DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE general_requests ADD COLUMN workflow_current_role TEXT DEFAULT 'SUPERVISOR';");
  safeExec(targetDb, "ALTER TABLE general_requests ADD COLUMN step_started_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE general_requests ADD COLUMN po_id TEXT;");
  safeExec(targetDb, "ALTER TABLE general_requests ADD COLUMN po_number TEXT;");
  safeExec(targetDb, "ALTER TABLE general_requests ADD COLUMN supplier_name TEXT;");
  safeExec(targetDb, "ALTER TABLE general_requests ADD COLUMN grn_id TEXT;");
  safeExec(targetDb, "ALTER TABLE general_requests ADD COLUMN grn_number TEXT;");
  safeExec(targetDb, "ALTER TABLE general_requests ADD COLUMN received_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN general_request_id TEXT;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN general_request_code TEXT;");
  safeExec(targetDb, "ALTER TABLE purchase_requests ADD COLUMN authorized_by TEXT;");
  safeExec(targetDb, "ALTER TABLE workspace_documents ADD COLUMN escalated_to TEXT;");
  safeExec(targetDb, "ALTER TABLE workspace_documents ADD COLUMN workflow_step_index INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE workspace_documents ADD COLUMN workflow_total_steps INTEGER DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE workspace_documents ADD COLUMN workflow_current_role TEXT;");
  safeExec(targetDb, "ALTER TABLE workspace_documents ADD COLUMN step_started_at DATETIME;");

  safeExec(targetDb, "ALTER TABLE sales_order_items ADD COLUMN quantity REAL DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE sales_order_items ADD COLUMN qty REAL DEFAULT 1;");

  safeExec(targetDb, "ALTER TABLE items ADD COLUMN item_type TEXT DEFAULT 'MATERIAL';");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN machine_category TEXT;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN capacity_per_hour REAL;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN machine_status TEXT DEFAULT 'AVAILABLE';");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN bypass_multi_station INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN serial_number TEXT;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN manufacturer TEXT;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN machine_specifications TEXT;");

  safeExec(targetDb, "ALTER TABLE production_stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN cycle_time_minutes REAL;");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN manpower_allocated REAL DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN assigned_machine_id TEXT REFERENCES items(id);");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN alternative_machine_ids TEXT DEFAULT '[]';");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN setup_time_minutes REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN teardown_time_minutes REAL DEFAULT 0;");

  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN qr_payload TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN qr_image_url TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN machine_id TEXT REFERENCES items(id);");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN good_units INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN reject_units INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN rework_units INTEGER DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN wot_number TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN bop_id TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN current_bop_id TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN station_id TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN qr_code_string TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN qr_signature TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN qr_code_data_url TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN last_scanned_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN last_scanned_by TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN parent_wot_id TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN rework_qty REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN qc_hold_qty REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN split_sequence INTEGER DEFAULT 0;");

  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN start_date TEXT;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN committed_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN planned_completion_date TEXT;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN planned_total_hours REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN actual_total_hours REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN project_performance_factor REAL;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN execution_summary_json TEXT;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN shift_hours REAL DEFAULT 8;");

  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN manpower_count INTEGER DEFAULT 1;");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN overtime_hours REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN qc_hold_qty REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN rework_qty REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN last_scanned_wot_id TEXT;");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN last_scanned_at DATETIME;");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN machine_id TEXT;");

  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN station_id TEXT;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN affected_item_id TEXT;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN affected_item_code TEXT;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN affected_item_name TEXT;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN ng_qty REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN cascade_scope TEXT DEFAULT 'SINGLE_PROCESS';");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN parent_ndp_id TEXT;");
  safeExec(targetDb, "ALTER TABLE notice_to_down_processes ADD COLUMN resolution_notes TEXT;");

  safeExec(targetDb, `
    CREATE TABLE IF NOT EXISTS factory_factor_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_name TEXT,
      planned_hours REAL DEFAULT 0,
      actual_hours REAL DEFAULT 0,
      planned_ff REAL DEFAULT 85,
      achieved_ff REAL DEFAULT 85,
      new_wma_ff REAL DEFAULT 85,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS production_process_threads (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      bop_id TEXT,
      process_name TEXT,
      wot_id TEXT,
      wot_number TEXT,
      author TEXT NOT NULL,
      role TEXT,
      message TEXT NOT NULL,
      is_pinned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS production_shift_handovers (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      shift TEXT DEFAULT 'SHIFT_1',
      outgoing_lead TEXT NOT NULL,
      incoming_lead TEXT,
      summary TEXT NOT NULL,
      pinned_alerts TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  safeExec(targetDb, "ALTER TABLE items ADD COLUMN category TEXT;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN description TEXT;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN min_stock REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN max_stock REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN stock_quantity REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE items ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;");

  safeExec(targetDb, "ALTER TABLE inventory ADD COLUMN physical_qty REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE inventory ADD COLUMN reserved_qty REAL DEFAULT 0;");
  safeExec(targetDb, "ALTER TABLE inventory ADD COLUMN available_qty REAL DEFAULT 0;");

  // ISA-95 / APICS Unified Order Header & End-to-End Traceability Columns
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN spk_number TEXT;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN ntp_number TEXT;");
  safeExec(targetDb, "ALTER TABLE projects ADD COLUMN lifecycle_stage TEXT DEFAULT 'ENGINEERING_PREP';");

  safeExec(targetDb, "ALTER TABLE delivery_notes ADD COLUMN fgr_id TEXT;");
  safeExec(targetDb, "ALTER TABLE delivery_notes ADD COLUMN fgr_number TEXT;");
  safeExec(targetDb, "ALTER TABLE delivery_notes ADD COLUMN spk_number TEXT;");
  safeExec(targetDb, "ALTER TABLE delivery_notes ADD COLUMN fulfillment_mode TEXT DEFAULT 'MTO';");

  safeExec(targetDb, "ALTER TABLE material_dispatches ADD COLUMN floor_request_id TEXT;");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN qc_parameters_json TEXT DEFAULT '[]';");
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN product_role TEXT;");

  // Backfill Unified Order Header references on projects
  safeExec(
    targetDb,
    `UPDATE projects
     SET spk_id = COALESCE(spk_id, (SELECT id FROM spks WHERE spks.project_id = projects.id LIMIT 1)),
         spk_number = COALESCE(spk_number, (SELECT spk_number FROM spks WHERE spks.project_id = projects.id LIMIT 1)),
         ntp_id = COALESCE(ntp_id, (SELECT id FROM ntps WHERE ntps.project_id = projects.id LIMIT 1)),
         ntp_number = COALESCE(ntp_number, (SELECT ntp_number FROM ntps WHERE ntps.project_id = projects.id LIMIT 1))
     WHERE spk_number IS NULL OR ntp_number IS NULL;`
  );

  // Backfill lifecycle_stage on projects based on actual state
  safeExec(
    targetDb,
    `UPDATE projects
     SET lifecycle_stage = CASE
       WHEN status IN ('FINISHED', 'COMPLETED', 'CLOSED') THEN 'COMPLETED_FGR'
       WHEN is_master_set = 1 THEN 'SHOP_FLOOR_EXECUTION'
       ELSE 'ENGINEERING_PREP'
     END
     WHERE lifecycle_stage IS NULL OR lifecycle_stage = 'ENGINEERING_PREP';`
  );

  // Backfill FGR and SPK traceability on delivery_notes
  safeExec(
    targetDb,
    `UPDATE delivery_notes
     SET fgr_id = COALESCE(fgr_id, (SELECT id FROM finish_good_records fgr WHERE fgr.project_id = delivery_notes.project_id ORDER BY fgr.created_at DESC LIMIT 1)),
         fgr_number = COALESCE(fgr_number, (SELECT fgr_number FROM finish_good_records fgr WHERE fgr.project_id = delivery_notes.project_id ORDER BY fgr.created_at DESC LIMIT 1)),
         spk_number = COALESCE(spk_number, (SELECT spk_number FROM projects p WHERE p.id = delivery_notes.project_id LIMIT 1)),
         fulfillment_mode = CASE WHEN project_id IS NOT NULL THEN 'MTO' ELSE 'MTS' END
     WHERE fgr_number IS NULL OR spk_number IS NULL;`
  );

  // Roadmap Phase 1: Single-Source MES Execution Consolidation (project_tasks & work_orders -> bill_of_processes & work_order_tickets)
  safeExec(targetDb, "ALTER TABLE bill_of_processes ADD COLUMN legacy_task_id TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN legacy_wo_id TEXT;");
  safeExec(targetDb, "ALTER TABLE work_order_tickets ADD COLUMN completed_qty REAL DEFAULT 0;");

  // Cleanup ghost procurement process nodes that were previously migrated from project_tasks into bill_of_processes
  safeExec(
    targetDb,
    `DELETE FROM bill_of_processes
     WHERE id LIKE 'BOP-TSK-%'
        OR legacy_task_id LIKE 'TSK-%'
        OR process_name LIKE '[Procurement]%'
        OR process_name LIKE 'Materials:%'
        OR process_name LIKE 'Arrival:%'
        OR process_name LIKE 'Material Procurement%'
        OR process_name LIKE 'SPK Material Procurement%'
        OR process_name LIKE 'ECO Procurement Revision%';`
  );

  // Idempotent migration: project_tasks -> bill_of_processes (strictly excluding PR/Procurement tasks and projects that already have native BOP steps)
  safeExec(
    targetDb,
    `INSERT OR IGNORE INTO bill_of_processes (
       id, project_id, step_sequence, process_name, node_type, work_center_id,
       standard_hours, cycle_time_minutes, start_date, end_date,
       actual_start_date, actual_end_date, status, progress, legacy_task_id
     )
     SELECT
       'BOP-' || pt.id,
       pt.project_id,
       COALESCE(
         (SELECT COUNT(*) + 1 FROM project_tasks pt2 WHERE pt2.project_id = pt.project_id AND pt2.rowid < pt.rowid),
         1
       ),
       pt.task_name,
       'PROCESS',
       pt.work_center_id,
       CASE WHEN COALESCE(pt.required_hours, 0) > 0 THEN pt.required_hours ELSE 8.0 END,
       CASE WHEN COALESCE(pt.required_hours, 0) > 0 THEN pt.required_hours * 60.0 ELSE 60.0 END,
       pt.start_date,
       pt.end_date,
       pt.actual_start_date,
       pt.actual_end_date,
       COALESCE(pt.status, 'PENDING'),
       COALESCE(pt.progress, 0),
       pt.id
     FROM project_tasks pt
     WHERE pt.pr_id IS NULL
       AND pt.id NOT LIKE 'TSK-%'
       AND pt.task_name NOT LIKE '[Procurement]%'
       AND pt.task_name NOT LIKE 'Materials:%'
       AND pt.task_name NOT LIKE 'Arrival:%'
       AND pt.task_name NOT LIKE 'Material Procurement%'
       AND pt.task_name NOT LIKE 'SPK Material Procurement%'
       AND pt.task_name NOT LIKE 'ECO Procurement Revision%'
       AND NOT EXISTS (
         SELECT 1 FROM bill_of_processes b
         WHERE b.project_id = pt.project_id
       );`
  );

  // Idempotent migration: work_orders -> work_order_tickets
  safeExec(
    targetDb,
    `INSERT OR IGNORE INTO work_order_tickets (
       id, project_id, lot_number, wot_number, qty, completed_qty, status,
       completed_at, created_at, legacy_wo_id
     )
     SELECT
       'WOT-' || wo.id,
       wo.project_id,
       wo.wo_number,
       wo.wo_number,
       COALESCE((SELECT qty FROM projects p WHERE p.id = wo.project_id), 1),
       CASE
         WHEN wo.status IN ('COMPLETED', 'FINISHED') THEN COALESCE((SELECT qty FROM projects p WHERE p.id = wo.project_id), 1)
         ELSE 0
       END,
       CASE
         WHEN wo.status IN ('COMPLETED', 'FINISHED') THEN 'COMPLETED'
         WHEN wo.status IN ('IN_PROGRESS', 'RUNNING', 'ISSUED') THEN 'IN_PROGRESS'
         ELSE 'PLANNED'
       END,
       wo.completed_at,
       wo.created_at,
       wo.id
     FROM work_orders wo
     WHERE NOT EXISTS (
       SELECT 1 FROM work_order_tickets w
       WHERE w.legacy_wo_id = wo.id
          OR w.id = wo.id
          OR w.wot_number = wo.wo_number
          OR w.lot_number = wo.wo_number
     );`
  );

  // Normalize legacy non-standard department & role values across all tables to the 10 RBAC/PBAC standard codes
  const deptColumns: Array<{ table: string; column: string }> = [
    { table: "users", column: "role" },
    { table: "general_requests", column: "department" },
    { table: "purchase_requests", column: "department" },
    { table: "workspace_documents", column: "department" },
    { table: "workspace_documents", column: "authorization_department" },
    { table: "workflow_approvals", column: "department" },
    { table: "hr_jobs", column: "department" },
  ];

  for (const { table, column } of deptColumns) {
    safeExec(
      targetDb,
      `UPDATE ${table}
       SET ${column} = CASE
         WHEN UPPER(TRIM(${column})) IN ('PRODUKSI', 'MAINTENANCE', 'WORKSHOP', 'OPERATIONS', 'PLANT') THEN 'PRODUCTION'
         WHEN UPPER(TRIM(${column})) IN ('RND_LAB', 'R&D', 'RND', 'IT', 'TECH') THEN 'ENGINEERING'
         WHEN UPPER(TRIM(${column})) IN ('QC_QA', 'QC', 'QA', 'QUALITY') THEN 'QA_QC'
         WHEN UPPER(TRIM(${column})) IN ('GA_UMUM', 'GA', 'UMUM', 'GENERAL', 'HRIS', 'HUMAN RESOURCES') THEN 'HR'
         WHEN UPPER(TRIM(${column})) IN ('LOGISTIC', 'LOGISTICS', 'GUDANG', 'INVENTORY') THEN 'WAREHOUSE'
         WHEN UPPER(TRIM(${column})) IN ('PROCUREMENT', 'PENGADAAN') THEN 'PURCHASING'
         WHEN UPPER(TRIM(${column})) IN ('ACCOUNTING', 'KEUANGAN', 'PAYROLL') THEN 'FINANCE'
         WHEN UPPER(TRIM(${column})) IN ('COMMERCIAL', 'MARKETING') THEN 'SALES'
         WHEN UPPER(TRIM(${column})) IN ('PLANNING', 'MRP') THEN 'PPIC'
         WHEN UPPER(TRIM(${column})) IN ('BOD', 'ADMIN', 'SUPERADMIN', 'DIRECTOR', 'MANAGEMENT', 'FULL CONTROL', 'FACTORY_CONTROLLER') THEN 'FC'
         ELSE UPPER(TRIM(${column}))
       END
       WHERE ${column} IS NOT NULL AND TRIM(${column}) != '';`
    );
  }
}

export function runAllMigrations(db: any) {
  runCoreAndSystemMigrations(db);
  runCrmSalesAndShopMigrations(db);
  runInventoryAndScmMigrations(db);
  runProductionAndMesMigrations(db);
  runFinanceAndAccountingMigrations(db);
  runHrisAndHcmMigrations(db);
    // 3. Clean up non-project procurement categories so they do not appear as active projects
    db.prepare(
      `
        UPDATE projects
        SET status = 'INTERNAL_OVERHEAD',
            archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)
        WHERE id IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
    `,
    ).run();

    // Default 3-Tier Dynamic Approval Matrices & Real-Time SLA Rules Seed
    const seedMatrixStmt = db.prepare(`
      INSERT OR IGNORE INTO workflow_matrices (id, document_type, min_amount, max_amount, roles, is_parallel)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    // Purchase Order Tiers
    seedMatrixStmt.run("MATRIX-PO-1", "Purchase Order", 0, 10000000, JSON.stringify(["SUPERVISOR", "PURCHASING_MANAGER"]), 0);
    seedMatrixStmt.run("MATRIX-PO-2", "Purchase Order", 10000000, 50000000, JSON.stringify(["PURCHASING_MANAGER", "FINANCE_MANAGER"]), 0);
    seedMatrixStmt.run("MATRIX-PO-3", "Purchase Order", 50000000, null, JSON.stringify(["PURCHASING_MANAGER", "FINANCE_MANAGER", "DIRECTOR"]), 0);

    // Purchase Request Tiers
    seedMatrixStmt.run("MATRIX-PR-1", "Purchase Request", 0, 5000000, JSON.stringify(["SUPERVISOR"]), 0);
    seedMatrixStmt.run("MATRIX-PR-2", "Purchase Request", 5000000, 25000000, JSON.stringify(["SUPERVISOR", "MANAGER"]), 0);
    seedMatrixStmt.run("MATRIX-PR-3", "Purchase Request", 25000000, null, JSON.stringify(["MANAGER", "FC"]), 0);

    // Quotation Tiers
    seedMatrixStmt.run("MATRIX-QUO-1", "Quotation", 0, 25000000, JSON.stringify(["SUPERVISOR", "SALES_MANAGER"]), 0);
    seedMatrixStmt.run("MATRIX-QUO-2", "Quotation", 25000000, 100000000, JSON.stringify(["SALES_MANAGER", "FINANCE_MANAGER"]), 0);
    seedMatrixStmt.run("MATRIX-QUO-3", "Quotation", 100000000, null, JSON.stringify(["SALES_MANAGER", "FC", "DIRECTOR"]), 0);

    // General Request & Workspace Document Tiers
    seedMatrixStmt.run("MATRIX-GRQ-1", "General Request", 0, 10000000, JSON.stringify(["SUPERVISOR", "MANAGER"]), 0);
    seedMatrixStmt.run("MATRIX-GRQ-2", "General Request", 10000000, null, JSON.stringify(["MANAGER", "FC"]), 0);
    seedMatrixStmt.run("MATRIX-WSD-1", "Workspace Document", 0, null, JSON.stringify(["SUPERVISOR", "MANAGER"]), 0);

    const seedSlaStmt = db.prepare(`
      INSERT OR IGNORE INTO workflow_slas (id, document_type, step, sla_hours, escalate_to)
      VALUES (?, ?, ?, ?, ?)
    `);
    seedSlaStmt.run("SLA-PR-1", "Purchase Request", "SUPERVISOR", 8, "MANAGER");
    seedSlaStmt.run("SLA-PR-2", "Purchase Request", "MANAGER", 16, "FC");
    seedSlaStmt.run("SLA-PO-1", "Purchase Order", "SUPERVISOR", 12, "PURCHASING_MANAGER");
    seedSlaStmt.run("SLA-PO-2", "Purchase Order", "PURCHASING_MANAGER", 24, "FINANCE_MANAGER");
    seedSlaStmt.run("SLA-PO-3", "Purchase Order", "FINANCE_MANAGER", 24, "DIRECTOR");
    seedSlaStmt.run("SLA-QUO-1", "Quotation", "SALES_MANAGER", 12, "FC");
    seedSlaStmt.run("SLA-GRQ-1", "General Request", "SUPERVISOR", 12, "MANAGER");
    seedSlaStmt.run("SLA-WSD-1", "Workspace Document", "MANAGER", 24, "FC");

    const stmt = db.prepare(`
        INSERT OR IGNORE INTO users (id, username, password, role, level, name, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    // Seed core users with bcrypt hashes only if they do not already exist (never overwrite existing credentials)
    stmt.run(
      "MASTER-1",
      "Eghy",
      "$2b$10$XtObrJZWddCJkEUs9rI8EObsbDLSlQLT7rXREv7SR9Js0gmLFadtK",
      "FC",
      "MANAGER",
      "Eghy Al Vandi",
      "APPROVED",
    );
    stmt.run(
      "MASTER-2",
      "Ludy",
      "$2b$10$0gx7pqwKnm.JRJ8nT70k6u3VFGTanqt2gxc1S4OBhhZ.a.Ru3N.TO",
      "FC",
      "MANAGER",
      "Bachtiar Ludy",
      "APPROVED",
    );
    stmt.run(
      "admin",
      "admin",
      "$2b$10$KbOKkHur8AGjc.Gy1dYkROOC4XsHt6GNVSDtFFIlCYygjxEXwmmAu",
      "FC",
      "MANAGER",
      "System Admin",
      "APPROVED",
    );

    // Setup Forum Group
    const generalThreadId = "THREAD-GENERAL";
    db.prepare(
      `
    INSERT OR IGNORE INTO chat_threads (id, name, is_group, created_by)
    VALUES (?, ?, 1, 'system')
    `,
    ).run(generalThreadId, "Forum");

    // Migration: Update existing name to Forum
    db.prepare(
      "UPDATE chat_threads SET name = 'Forum' WHERE id = 'THREAD-GENERAL'",
    ).run();

    // Auto-assign existing users to general discussion
    db.prepare(
      `
    INSERT OR IGNORE INTO chat_participants (thread_id, username)
    SELECT ?, username FROM users
    `,
    ).run(generalThreadId);

    // Ensure required schema columns exist if tables were created in older migrations
    try {
      const labelCols = db.prepare("PRAGMA table_info(inventory_labels)").all() as any[];
      if (labelCols.length > 0 && !labelCols.some((c: any) => c.name === "project_id")) {
        db.exec("ALTER TABLE inventory_labels ADD COLUMN project_id TEXT;");
      }
      const wcCols = db.prepare("PRAGMA table_info(work_centers)").all() as any[];
      if (wcCols.length > 0 && !wcCols.some((c: any) => c.name === "code")) {
        db.exec("ALTER TABLE work_centers ADD COLUMN code TEXT;");
      }
      const dnCols = db.prepare("PRAGMA table_info(delivery_notes)").all() as any[];
      if (dnCols.length > 0 && !dnCols.some((c: any) => c.name === "quotation_id")) {
        db.exec("ALTER TABLE delivery_notes ADD COLUMN quotation_id TEXT;");
      }
      const priCols = db.prepare("PRAGMA table_info(pr_items)").all() as any[];
      if (priCols.length > 0 && !priCols.some((c: any) => c.name === "project_id")) {
        db.exec("ALTER TABLE pr_items ADD COLUMN project_id TEXT;");
      }
    } catch (_) {}

    // Create Indices
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inventory_labels_item ON inventory_labels(item_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_labels_grn ON inventory_labels(grn_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_labels_project ON inventory_labels(project_id);
      CREATE INDEX IF NOT EXISTS idx_items_code ON items(item_code);
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE INDEX IF NOT EXISTS idx_projects_deleted ON projects(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_boms_project ON boms(project_id);
      CREATE INDEX IF NOT EXISTS idx_boms_item ON boms(item_id);
      CREATE INDEX IF NOT EXISTS idx_pr_project ON purchase_requests(project_id);
      CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests(status);
      CREATE INDEX IF NOT EXISTS idx_pr_items_pr ON pr_items(pr_id);
      CREATE INDEX IF NOT EXISTS idx_po_items_po ON pr_items(po_id);
      CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
      CREATE INDEX IF NOT EXISTS idx_grns_po ON grns(po_id);
      CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON grn_items(grn_id);
      CREATE INDEX IF NOT EXISTS idx_grn_items_item ON grn_items(item_id);
      CREATE INDEX IF NOT EXISTS idx_movements_item ON stock_movements(item_id);
      CREATE INDEX IF NOT EXISTS idx_movements_project ON stock_movements(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_wo_project ON work_orders(project_id);
      CREATE INDEX IF NOT EXISTS idx_wo_station_status ON work_orders(current_work_center_id, status);
      CREATE INDEX IF NOT EXISTS idx_wo_items_wo ON work_order_items(wo_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory(item_id);
      CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_trail(resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_forum_comments_post ON forum_comments(post_id);
      CREATE INDEX IF NOT EXISTS idx_project_tasks_wc ON project_tasks(work_center_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_chat_participants_username ON chat_participants(username);
      CREATE INDEX IF NOT EXISTS idx_item_price_history ON item_price_history(item_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
      CREATE INDEX IF NOT EXISTS idx_bom_template_items_template ON bom_template_items(template_id);
      CREATE INDEX IF NOT EXISTS idx_bom_template_items_item ON bom_template_items(item_id);
      CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
      CREATE INDEX IF NOT EXISTS idx_journal_entries_ref ON journal_entries(reference_type, reference_id);
      CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_entry_lines(entry_id);
      CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_entry_lines(account_code);
      CREATE INDEX IF NOT EXISTS idx_lot_exec_status_start ON lot_routing_executions(status, start_time);
      CREATE INDEX IF NOT EXISTS idx_lot_exec_lot_bop ON lot_routing_executions(lot_id, bop_id);
      CREATE INDEX IF NOT EXISTS idx_bop_project_status ON bill_of_processes(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_bop_status ON bill_of_processes(status);
      CREATE INDEX IF NOT EXISTS idx_prod_lots_project ON production_lots(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_ndp_project_status ON notice_to_down_processes(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_inv_res_project ON inventory_reservations(project_id);
      CREATE INDEX IF NOT EXISTS idx_inv_res_item ON inventory_reservations(item_id);
      CREATE INDEX IF NOT EXISTS idx_wot_project_station ON work_order_tickets(project_id, current_station_id, status);
      CREATE INDEX IF NOT EXISTS idx_wot_status ON work_order_tickets(status);
      CREATE INDEX IF NOT EXISTS idx_stn_project_seq ON project_stations(project_id, station_sequence);
      CREATE INDEX IF NOT EXISTS idx_prod_manpower_assign ON production_manpower_assignments(project_id, station_id, status);

      -- High Performance Composite Indexes for Elimination of N+1 & Query Latency Optimization
      CREATE INDEX IF NOT EXISTS idx_comm_invoices_dn_status ON commercial_invoices(dn_id, status);
      CREATE INDEX IF NOT EXISTS idx_comm_invoices_created ON commercial_invoices(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_del_items_dn_item ON delivery_items(dn_id, item_id);
      CREATE INDEX IF NOT EXISTS idx_del_notes_quot_proj ON delivery_notes(quotation_id, project_id, status);
      CREATE INDEX IF NOT EXISTS idx_quot_items_quot ON quotation_items(quotation_id, id);
      CREATE INDEX IF NOT EXISTS idx_projects_quot_spk ON projects(quotation_id, spk_id, status);
      CREATE INDEX IF NOT EXISTS idx_pr_items_po_pr ON pr_items(po_id, pr_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_item_created ON stock_movements(item_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_finance_trans_date_cat ON finance_transactions(transaction_date DESC, category);
      CREATE INDEX IF NOT EXISTS idx_jel_account_entry ON journal_entry_lines(account_code, entry_id);
      CREATE INDEX IF NOT EXISTS idx_jel_entry_account ON journal_entry_lines(entry_id, account_code);
      CREATE INDEX IF NOT EXISTS idx_je_date_created ON journal_entries(entry_date, created_at);
      CREATE INDEX IF NOT EXISTS idx_ci_status_due ON commercial_invoices(status, payment_status, created_at);
      CREATE INDEX IF NOT EXISTS idx_items_type_code ON items(type, item_code);
      CREATE INDEX IF NOT EXISTS idx_items_name_code ON items(name, item_code);
      CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory(item_id);
      CREATE INDEX IF NOT EXISTS idx_customers_code_name ON customers(code, name);
      CREATE INDEX IF NOT EXISTS idx_suppliers_code_name ON suppliers(code, name);
      CREATE INDEX IF NOT EXISTS idx_bop_project_node ON bill_of_processes(project_id, node_type);
      CREATE INDEX IF NOT EXISTS idx_lot_exec_bop_lot ON lot_routing_executions(bop_id, lot_id);
      CREATE INDEX IF NOT EXISTS idx_pri_project_item ON pr_items(project_id, item_id);
      CREATE INDEX IF NOT EXISTS idx_vis_act_customer_created ON visitor_activities(customer_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_pnl_step_proj ON product_node_lifecycle(bop_step_id, project_id);

  `);
  runPostTableMigrations(db);
}
