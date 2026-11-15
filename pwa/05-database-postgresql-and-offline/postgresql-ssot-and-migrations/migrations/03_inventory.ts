import { safeExec } from "./runner.ts";

export function runInventoryAndScmMigrations(db: any) {
  db.exec(`
      CREATE TABLE IF NOT EXISTS material_requests (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        station_id TEXT,
        item_id TEXT,
        item_name TEXT,
        qty REAL DEFAULT 1,
        status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS material_dispatches (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        station_id TEXT,
        dispatch_qty REAL NOT NULL,
        status TEXT DEFAULT 'RECEIVED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        item_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        dimension TEXT,
        spec TEXT,
        type TEXT CHECK (type IN ('RAW', 'WIP', 'FINISHED', 'TOOL', 'MACHINE')),
        item_type TEXT DEFAULT 'MATERIAL',
        uom TEXT NOT NULL,
        unit_price REAL DEFAULT 0,
        selling_price REAL DEFAULT 0,
        lead_time_days INTEGER DEFAULT 0,
        category TEXT,
        description TEXT,
        min_stock REAL DEFAULT 0,
        max_stock REAL DEFAULT 0,
        stock_quantity REAL DEFAULT 0,
        machine_category TEXT,
        capacity_per_hour REAL,
        operational_status TEXT DEFAULT 'AVAILABLE',
        machine_status TEXT DEFAULT 'AVAILABLE',
        bypass_multi_station INTEGER DEFAULT 0,
        serial_number TEXT,
        manufacturer TEXT,
        machine_specifications TEXT,
        alternative_machine_ids TEXT DEFAULT '[]',
        barcode TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        npwp TEXT,
        tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN',
        payment_terms TEXT DEFAULT 'Net 30 Days',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS inventory (
        item_id TEXT PRIMARY KEY,
        physical_qty REAL DEFAULT 0,
        reserved_qty REAL DEFAULT 0,
        available_qty REAL DEFAULT 0,
        free_stock REAL DEFAULT 0,
        allocated_stock REAL DEFAULT 0,
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS warehouse_stock (
        warehouse_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (warehouse_id, item_id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
      CREATE TABLE IF NOT EXISTS boms (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        dimension TEXT,
        spec TEXT,
        required_qty REAL NOT NULL,
        unit_price REAL DEFAULT 0,
        reference TEXT,
        target_project_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS purchase_requests (
        id TEXT PRIMARY KEY,
        pr_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        expected_delivery_date TEXT,
        drawing_reference TEXT,
        total_estimated_cost REAL DEFAULT 0,
        status TEXT DEFAULT 'DRAFTED',
        authorized_at DATETIME,
        authorized_doc TEXT,
        cancelled_at DATETIME,
        archived INTEGER DEFAULT 0,
        urgency TEXT DEFAULT 'NORMAL',
        revision_note TEXT,
        remarks TEXT,
        escalated_to TEXT,
        category TEXT DEFAULT 'PROJECT',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        po_number TEXT UNIQUE NOT NULL,
        supplier_id TEXT,
        supplier_name TEXT NOT NULL,
        supplier_npwp TEXT,
        expected_date TEXT,
        auth_doc_name TEXT,
        total_amount REAL DEFAULT 0,
        tax_category TEXT DEFAULT 'GOODS',
        tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN',
        ppn_rate REAL DEFAULT 12,
        pph_rate REAL DEFAULT 0,
        dpp REAL DEFAULT 0,
        dpp_nilai_lain REAL DEFAULT 0,
        ppn REAL DEFAULT 0,
        pph REAL DEFAULT 0,
        rounding_factor REAL DEFAULT 0,
        grand_total REAL DEFAULT 0,
        payment_terms TEXT DEFAULT 'Net 30 Days',
        status TEXT DEFAULT 'DRAFTED',
        authorized_at DATETIME,
        cancelled_at DATETIME,
        archived INTEGER DEFAULT 0,
        urgency TEXT DEFAULT 'NORMAL',
        revision_note TEXT,
        escalated_to TEXT,
        amount_paid REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'UNPAID',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      );

      CREATE TABLE IF NOT EXISTS pr_items (
        id TEXT PRIMARY KEY,
        pr_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        dimension TEXT,
        spec TEXT,
        expected_delivery_date TEXT,
        qty REAL NOT NULL,
        unit_price REAL DEFAULT 0,
        po_id TEXT,
        revision_note TEXT,
        FOREIGN KEY (pr_id) REFERENCES purchase_requests(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
      );

      CREATE TABLE IF NOT EXISTS grns (
        id TEXT PRIMARY KEY,
        po_id TEXT NOT NULL,
        received_date TEXT NOT NULL,
        engineering_user TEXT,
        qc_user TEXT,
        qc_status TEXT CHECK (qc_status IN ('PASSED', 'REJECTED', 'CONDITIONAL')),
        remarks TEXT,
        rejected_grn_doc TEXT,
        is_reissue BOOLEAN DEFAULT 0,
        inventory_updated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
      );

      CREATE TABLE IF NOT EXISTS grn_items (
        id TEXT PRIMARY KEY,
        grn_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        dimension TEXT,
        spec TEXT,
        qty_received REAL NOT NULL,
        FOREIGN KEY (grn_id) REFERENCES grns(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        project_id TEXT,
        type TEXT CHECK (type IN ('ALLOCATION', 'GRN', 'CONSUMPTION', 'ADJUSTMENT', 'RELEASE', 'GRN_ALLOCATION', 'RETURN')),
        qty REAL NOT NULL,
        reference_id TEXT,
        recorded_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS bom_item_consumption (
        id TEXT PRIMARY KEY,
        bom_id TEXT UNIQUE NOT NULL,
        qty_consumed REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bom_id) REFERENCES boms(id)
      );
      CREATE TABLE IF NOT EXISTS general_requests (
        id TEXT PRIMARY KEY,
        request_code TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL, -- MAINTENANCE, TOOLING, RND, CONSUMABLE, INFRASTRUCTURE, SPECIAL_DESIGN
        department TEXT NOT NULL, -- PRODUKSI, MAINTENANCE, RND_LAB, WAREHOUSE, QC_QA, GA_UMUM, ENGINEERING
        requester_name TEXT NOT NULL,
        requester_username TEXT NOT NULL,
        priority TEXT DEFAULT 'NORMAL', -- NORMAL, URGENT, CRITICAL
        justification TEXT,
        drawing_reference TEXT,
        technical_specs TEXT,
        attachments_json TEXT DEFAULT '[]',
        target_delivery_date TEXT,
        status TEXT DEFAULT 'SUBMITTED', -- DRAFT, SUBMITTED, APPROVED, PR_GENERATED, REJECTED
        estimated_total_cost REAL DEFAULT 0,
        approved_by TEXT,
        approved_at DATETIME,
        pr_id TEXT,
        pr_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS general_request_items (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        item_id TEXT,
        item_code TEXT,
        item_name TEXT NOT NULL,
        specification TEXT,
        part_number TEXT,
        qty REAL NOT NULL DEFAULT 1,
        uom TEXT NOT NULL DEFAULT 'PCS',
        estimated_unit_price REAL DEFAULT 0,
        estimated_subtotal REAL DEFAULT 0,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES general_requests(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS inventory_labels (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        grn_id TEXT,
        original_qty REAL NOT NULL,
        current_qty REAL NOT NULL,
        project_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS inventory_reservations (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        spk_id TEXT,
        qty REAL NOT NULL,
        status TEXT DEFAULT 'ACTIVE', -- ACTIVE, CONSUMED, CANCELLED
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      DROP TABLE IF EXISTS warehouse_bin_transfers;
      DROP TABLE IF EXISTS warehouse_bin_allocations;
      DROP TABLE IF EXISTS warehouse_bins;
      DROP TABLE IF EXISTS warehouse_zones;

      CREATE TABLE IF NOT EXISTS item_price_history (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        unit_price REAL NOT NULL,
        recorded_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      );
      CREATE TABLE IF NOT EXISTS item_supplier_prices (
        item_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        unit_price REAL NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (item_id, supplier_id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      );
      CREATE TABLE IF NOT EXISTS material_readiness (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        process_id TEXT,
        item_id TEXT NOT NULL,
        required_qty REAL DEFAULT 1,
        ready_qty REAL DEFAULT 0,
        material_ready_at DATETIME,
        source_wave_id TEXT,
        status TEXT DEFAULT 'PENDING',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS material_dispatches (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        bop_step_id TEXT,
        product_node_id TEXT,
        bom_id TEXT,
        item_id TEXT NOT NULL,
        dispatch_qty REAL NOT NULL,
        dispatched_by TEXT,
        dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        received_by_production TEXT,
        received_at DATETIME,
        status TEXT DEFAULT 'DISPATCHED'
      );
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

      CREATE INDEX IF NOT EXISTS idx_po_status_date ON purchase_orders(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_pr_status_date ON purchase_requests(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_pplan_project ON procurement_plans(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_pwave_plan ON procurement_plan_waves(plan_id, wave_number);
  `);
    // Ensure columns on pr_items and procurement_plan tables for wave locking & Manufacturing Wave tracking
    safeExec(db, "ALTER TABLE pr_items ADD COLUMN plan_id TEXT;");
    safeExec(db, "ALTER TABLE pr_items ADD COLUMN plan_wave_id TEXT;");
    safeExec(db, "ALTER TABLE pr_items ADD COLUMN parent_pr_item_id TEXT;");
    safeExec(db, "ALTER TABLE procurement_plans ADD COLUMN wot_lots_per_wave INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE procurement_plans ADD COLUMN master_lot_size INTEGER DEFAULT 10;");
    safeExec(db, "ALTER TABLE procurement_plans ADD COLUMN total_wot_lots INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE procurement_plans ADD COLUMN shift_hours INTEGER DEFAULT 8;");
    safeExec(db, "ALTER TABLE procurement_plans ADD COLUMN factory_factor REAL DEFAULT 85;");
    safeExec(db, "ALTER TABLE procurement_plan_waves ADD COLUMN generated_pos_json TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_waves ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_waves ADD COLUMN station_code TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_waves ADD COLUMN bop_process_summary TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_waves ADD COLUMN wot_lot_range TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_waves ADD COLUMN wot_batch_ratio REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE procurement_plan_waves ADD COLUMN priority_focus TEXT DEFAULT 'CRITICAL_MAIN';");
    safeExec(db, "ALTER TABLE procurement_plan_waves ADD COLUMN critical_items_count INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE procurement_plan_waves ADD COLUMN core_items_count INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE procurement_plan_waves ADD COLUMN supporting_items_count INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN generated_po_id TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN generated_po_number TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN bop_step_id TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN station_name TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN bom_id TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN priority_tier TEXT DEFAULT 'CORE_PROCESS';");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN priority_score INTEGER DEFAULT 50;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN priority_reason TEXT;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN downstream_process_count INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN total_process_count INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN float_hours REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN is_priority_manual_override INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN is_critical_path INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN process_allocation_fraction REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE procurement_plan_items ADD COLUMN station_need_date TEXT;");

    // Add revision notes for Revise feature
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN remarks TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN escalated_to TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN category TEXT DEFAULT 'PROJECT';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN escalated_to TEXT;");
    // Items Column Migrations
    safeExec(db, "ALTER TABLE items ADD COLUMN category TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN description TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN min_stock REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN max_stock REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN stock_quantity REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;");
    safeExec(db, "UPDATE items SET stock_quantity = (SELECT COALESCE(free_stock, 0) FROM inventory WHERE inventory.item_id = items.id) WHERE stock_quantity IS NULL OR stock_quantity = 0;");

    // Inventory Dual-Stock Migrations
    safeExec(db, "ALTER TABLE inventory ADD COLUMN physical_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE inventory ADD COLUMN reserved_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE inventory ADD COLUMN available_qty REAL DEFAULT 0;");
    safeExec(db, `
      UPDATE inventory 
      SET physical_qty = COALESCE(NULLIF(physical_qty, 0), COALESCE(free_stock, 0) + COALESCE(allocated_stock, 0)),
          reserved_qty = COALESCE(NULLIF(reserved_qty, 0), COALESCE(allocated_stock, 0)),
          available_qty = COALESCE(NULLIF(available_qty, 0), COALESCE(free_stock, 0))
      WHERE (physical_qty IS NULL OR physical_qty = 0) AND (free_stock > 0 OR allocated_stock > 0);
    `);

    // General Requests & Procurement End-to-End Integration Migrations
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN authorized_doc TEXT;");
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN escalated_to TEXT;");
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN workflow_step_index INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN workflow_total_steps INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN workflow_current_role TEXT;");
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN step_started_at DATETIME;");
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN po_id TEXT;");
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN po_number TEXT;");
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN supplier_name TEXT;");
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN grn_id TEXT;");
    safeExec(db, "ALTER TABLE general_requests ADD COLUMN received_at DATETIME;");

    safeExec(db, "ALTER TABLE general_request_items ADD COLUMN dimension TEXT;");
    safeExec(db, "ALTER TABLE general_request_items ADD COLUMN available_stock_snapshot REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE general_request_items ADD COLUMN shortage_qty REAL DEFAULT 0;");

    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN general_request_id TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN requested_by TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN created_by TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN department TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN title TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN workflow_step_index INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN workflow_total_steps INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN workflow_current_role TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN step_started_at DATETIME;");

    // Backfill metadata from general_requests into linked purchase_requests
    safeExec(db, `
      UPDATE purchase_requests
      SET department = COALESCE(department, (SELECT gr.department FROM general_requests gr WHERE gr.id = purchase_requests.general_request_id OR gr.pr_id = purchase_requests.id)),
          title = COALESCE(title, (SELECT gr.title FROM general_requests gr WHERE gr.id = purchase_requests.general_request_id OR gr.pr_id = purchase_requests.id)),
          requested_by = COALESCE(requested_by, (SELECT gr.requester_name FROM general_requests gr WHERE gr.id = purchase_requests.general_request_id OR gr.pr_id = purchase_requests.id)),
          created_by = COALESCE(created_by, requested_by)
      WHERE general_request_id IS NOT NULL OR id IN (SELECT pr_id FROM general_requests WHERE pr_id IS NOT NULL);
    `);
}
