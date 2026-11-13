import { safeExec } from "./runner.ts";

export function runProductionAndMesMigrations(db: any) {
  db.exec(`
      CREATE TABLE IF NOT EXISTS stations (
        id TEXT PRIMARY KEY,
        station_name TEXT NOT NULL,
        station_code TEXT,
        station_sequence INTEGER DEFAULT 1,
        project_id TEXT,
        machine_ids TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS project_manpower (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        station_id TEXT,
        employee_id TEXT,
        employee_name TEXT,
        role TEXT,
        status TEXT DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS work_centers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        manpower_count INTEGER DEFAULT 1,
        hours_per_day REAL DEFAULT 8,
        days_per_week INTEGER DEFAULT 5,
        capacity_per_week REAL DEFAULT 40,
        efficiency_index REAL DEFAULT 1.0,
        status TEXT DEFAULT 'ACTIVE'
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        spk_number TEXT,
        priority INTEGER DEFAULT 3,
        due_date TEXT NOT NULL,
        customer TEXT,
        remarks TEXT,
        status TEXT DEFAULT 'DRAFT',
        urgency TEXT DEFAULT 'NORMAL',
        bq_updated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        archived_at DATETIME,
        deleted_at DATETIME,
        parent_project_id TEXT,
        factory_factor REAL DEFAULT 85,
        FOREIGN KEY (parent_project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS bom_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bom_template_items (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        dimension TEXT,
        spec TEXT,
        required_qty REAL NOT NULL,
        unit_price REAL DEFAULT 0,
        FOREIGN KEY (template_id) REFERENCES bom_templates(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      
      CREATE TABLE IF NOT EXISTS production_logs (
        id TEXT PRIMARY KEY,
        log_type TEXT NOT NULL,
        project_id TEXT,
        wot_id TEXT,
        station_id TEXT,
        process_id TEXT,
        machine_id TEXT,
        user_id TEXT,
        user_role TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        device_info TEXT,
        gps_location TEXT,
        details TEXT,
        photo_urls TEXT,
        is_verified INTEGER DEFAULT 0,
        verified_by TEXT,
        verified_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS floor_requests (
        id TEXT PRIMARY KEY,
        request_code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        category TEXT DEFAULT 'NORMAL',
        status TEXT DEFAULT 'PENDING',
        requested_by TEXT NOT NULL,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        station_id TEXT,
        project_id TEXT,
        process_id TEXT,
        wot_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        photo_urls TEXT,
        qty_required REAL,
        unit TEXT,
        bom_item_id TEXT,
        item_name TEXT,
        auto_pr INTEGER DEFAULT 0,
        pr_id TEXT,
        tool_item_id TEXT,
        requested_machine_category TEXT,
        reason TEXT,
        fulfilled_by TEXT,
        fulfilled_at DATETIME,
        fulfillment_notes TEXT,
        fulfillment_photo_urls TEXT,
        acknowledged_at DATETIME,
        acknowledged_by TEXT,
        in_progress_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS ndps (
        id TEXT PRIMARY KEY,
        ndp_code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        severity TEXT DEFAULT 'MEDIUM',
        status TEXT DEFAULT 'ACTIVE',
        reported_by TEXT NOT NULL,
        reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_by TEXT,
        resolved_at DATETIME,
        description TEXT NOT NULL,
        photo_urls TEXT,
        affected_machine_id TEXT,
        machine_lockdown_scope TEXT,
        material_request TEXT,
        ripple_analysis TEXT,
        resolution_type TEXT,
        resolution_notes TEXT,
        verified_by_qc INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS machine_schedules (
        id TEXT PRIMARY KEY,
        machine_id TEXT NOT NULL,
        project_id TEXT,
        station_id TEXT,
        process_id TEXT,
        wot_id TEXT,
        assigned_at DATETIME NOT NULL,
        released_at DATETIME,
        is_active INTEGER DEFAULT 1,
        bypass_station_lock INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS wot_travel_logs (
        id TEXT PRIMARY KEY,
        wot_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        station_id TEXT,
        process_id TEXT,
        machine_id TEXT,
        user_id TEXT,
        user_name TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS project_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_name TEXT NOT NULL,
        work_center_id TEXT,
        required_hours REAL DEFAULT 0,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        actual_start_date TEXT,
        actual_end_date TEXT,
        progress INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        pr_id TEXT,
        po_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id)
      );

      CREATE TABLE IF NOT EXISTS work_orders (
        id TEXT PRIMARY KEY,
        wo_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        status TEXT DEFAULT 'DRAFT',
        current_work_center_id TEXT,
        current_step_sequence INTEGER DEFAULT 0,
        wip_status TEXT DEFAULT 'IN_BUFFER',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS work_order_items (
        id TEXT PRIMARY KEY,
        wo_id TEXT NOT NULL,
        bom_id TEXT NOT NULL,
        qty_to_consume REAL NOT NULL,
        qty_actually_consumed REAL DEFAULT 0,
        FOREIGN KEY (wo_id) REFERENCES work_orders(id),
        FOREIGN KEY (bom_id) REFERENCES boms(id)
      );

      CREATE TABLE IF NOT EXISTS work_center_routings (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        item_id TEXT,
        step_sequence INTEGER NOT NULL,
        work_center_id TEXT NOT NULL,
        operation_name TEXT NOT NULL,
        standard_cycle_time_mins REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id)
      );

      CREATE TABLE IF NOT EXISTS bop_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version_number TEXT NOT NULL,
        routing_json TEXT NOT NULL,
        published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        published_by TEXT,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
      CREATE TABLE IF NOT EXISTS production_stations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        station_code TEXT NOT NULL,
        station_name TEXT NOT NULL,
        station_type TEXT DEFAULT 'SERIAL',
        station_sequence INTEGER DEFAULT 1,
        machine_ids TEXT DEFAULT '[]',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bill_of_processes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        step_sequence INTEGER NOT NULL,
        process_name TEXT NOT NULL,
        node_type TEXT DEFAULT 'PROCESS', -- 'PROCESS' or 'PRODUCT'
        work_center_id TEXT,
        work_center_name TEXT,
        execution_type TEXT DEFAULT 'SERIAL', -- 'SERIAL' or 'PARALLEL'
        predecessor_ids TEXT DEFAULT '[]', -- JSON Array of IDs
        standard_hours REAL DEFAULT 8.0,
        manpower_allocated REAL DEFAULT 1,
        station_id TEXT,
        cycle_time_minutes REAL DEFAULT 0,
        assigned_machine_id TEXT,
        alternative_machine_ids TEXT DEFAULT '[]',
        setup_time_minutes REAL DEFAULT 0,
        teardown_time_minutes REAL DEFAULT 0,
        shift_mode INTEGER DEFAULT 1, -- 1, 2, or 3
        start_date TEXT,
        end_date TEXT,
        actual_start_date TEXT,
        actual_end_date TEXT,
        status TEXT DEFAULT 'PENDING', -- 'PENDING', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED'
        progress INTEGER DEFAULT 0,
        notes TEXT,
        completed_by_operator TEXT,
        completed_at_timestamp DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS product_node_lifecycle (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        bop_step_id TEXT NOT NULL,
        status TEXT DEFAULT 'PLANNED', -- 'PLANNED', 'ALLOCATED', 'AVAILABLE', 'CONSUMED', 'PRODUCED', 'SCRAPPED'
        qty REAL DEFAULT 0,
        location TEXT,
        scanned_by TEXT,
        scanned_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (bop_step_id) REFERENCES bill_of_processes(id)
      );

      CREATE TABLE IF NOT EXISTS notice_to_down_processes (
        id TEXT PRIMARY KEY,
        ndp_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        bop_id TEXT NOT NULL,
        reason_category TEXT NOT NULL, -- 'MATERIAL_DELAY', 'MACHINE_BREAKDOWN', 'QUALITY_REWORK', 'DESIGN_REVISION', 'FORCE_MAJEURE'
        reason_detail TEXT NOT NULL,
        estimated_down_hours REAL DEFAULT 0,
        actual_down_minutes REAL DEFAULT 0,
        authorized_by TEXT NOT NULL,
        authorized_role TEXT,
        pin_verified INTEGER DEFAULT 1,
        status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE' or 'RESOLVED'
        down_started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resumed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (bop_id) REFERENCES bill_of_processes(id)
      );

      CREATE TABLE IF NOT EXISTS task_travel_tags (
        id TEXT PRIMARY KEY,
        tag_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        bop_id TEXT NOT NULL,
        qr_payload TEXT NOT NULL,
        operator_name TEXT NOT NULL,
        operator_team TEXT,
        qc_inspector TEXT,
        qc_status TEXT DEFAULT 'PASSED',
        good_qty REAL DEFAULT 1,
        scrap_qty REAL DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        total_downtime_minutes REAL DEFAULT 0,
        verified_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (bop_id) REFERENCES bill_of_processes(id)
      );

      CREATE TABLE IF NOT EXISTS finish_good_records (
        id TEXT PRIMARY KEY,
        fgr_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        item_code TEXT NOT NULL,
        item_name TEXT,
        serial_number TEXT,
        quantity REAL DEFAULT 1,
        uom TEXT DEFAULT 'UNIT',
        status TEXT DEFAULT 'APPROVED',
        notes TEXT,
        inspected_by TEXT,
        target_warehouse TEXT DEFAULT 'WAREHOUSE_FG_1',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS wip_movements (
        id TEXT PRIMARY KEY,
        work_order_id TEXT NOT NULL,
        from_work_center_id TEXT,
        to_work_center_id TEXT NOT NULL,
        step_sequence INTEGER NOT NULL,
        good_qty REAL NOT NULL DEFAULT 1,
        scrap_qty REAL DEFAULT 0,
        operator_email TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_order_id) REFERENCES work_orders(id),
        FOREIGN KEY (from_work_center_id) REFERENCES work_centers(id),
        FOREIGN KEY (to_work_center_id) REFERENCES work_centers(id)
      );
      CREATE TABLE IF NOT EXISTS production_manpower (
        id TEXT PRIMARY KEY,
        user_username TEXT,
        nik TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role_title TEXT NOT NULL,
        skill_level TEXT DEFAULT 'SENIOR', -- MASTER, SENIOR, JUNIOR, APPRENTICE
        specialization TEXT NOT NULL, -- Machining, Welding & Fabrication, Assembly & Fitting, Quality Control, Finishing & Coating, Electrical & Wiring
        shift TEXT DEFAULT 'SHIFT_1', -- SHIFT_1, SHIFT_2, SHIFT_3, GENERAL
        status TEXT DEFAULT 'AVAILABLE', -- AVAILABLE, ON_DUTY, ON_LEAVE, REST
        phone TEXT,
        email TEXT,
        hourly_rate REAL DEFAULT 45000,
        certifications TEXT, -- JSON array
        active_project_id TEXT,
        active_task_name TEXT,
        total_hours_worked REAL DEFAULT 0,
        completed_tasks_count INTEGER DEFAULT 0,
        efficiency_rating REAL DEFAULT 95.0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS project_stations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        station_code TEXT NOT NULL,
        station_name TEXT NOT NULL,
        station_type TEXT DEFAULT 'SERIAL', -- 'SERIAL' or 'PARALLEL'
        max_manpower INTEGER DEFAULT 3,
        work_center_id TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS production_manpower_assignments (
        id TEXT PRIMARY KEY,
        manpower_id TEXT NOT NULL,
        project_id TEXT,
        task_name TEXT,
        bop_id TEXT,
        station_id TEXT,
        shift TEXT,
        assigned_date TEXT NOT NULL,
        target_end_date TEXT,
        planned_hours REAL DEFAULT 8,
        actual_hours REAL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED, CANCELLED, SCHEDULED
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (manpower_id) REFERENCES production_manpower(id)
      );

      CREATE TABLE IF NOT EXISTS eco_logs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        doc_type TEXT NOT NULL DEFAULT 'BOM',
        eco_number TEXT NOT NULL,
        eco_reason TEXT,
        authorized_by TEXT,
        authorized_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        previous_bom TEXT,
        current_bom TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      
      CREATE TABLE IF NOT EXISTS work_order_tickets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        lot_number TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 1,
        status TEXT DEFAULT 'PLANNED', -- PLANNED, QUEUED, RUNNING, COMPLETED, TRANSFERRED, FINISHED
        current_station_id TEXT,
        current_process_id TEXT,
        target_station_id TEXT,
        target_process_id TEXT,
        source_station_id TEXT,
        consumed_at DATETIME,
        started_at DATETIME,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS production_lots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        spk_id TEXT,
        lot_number TEXT NOT NULL,
        target_qty INTEGER NOT NULL DEFAULT 1,
        status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS lot_routing_executions (
        id TEXT PRIMARY KEY,
        lot_id TEXT NOT NULL,
        bop_id TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        good_qty INTEGER DEFAULT 0,
        reject_qty INTEGER DEFAULT 0,
        start_time DATETIME,
        end_time DATETIME,
        operator_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lot_id) REFERENCES production_lots(id),
        FOREIGN KEY (bop_id) REFERENCES bill_of_processes(id)
      );
      
      CREATE TABLE IF NOT EXISTS unit_process_progress (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        spk_id TEXT,
        unit_code TEXT NOT NULL,
        bop_id TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        start_time DATETIME,
        completed_time DATETIME,
        completed_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (bop_id) REFERENCES bill_of_processes(id)
      );

      CREATE INDEX IF NOT EXISTS idx_unit_prog_proj ON unit_process_progress(project_id);
      CREATE INDEX IF NOT EXISTS idx_unit_prog_bop ON unit_process_progress(bop_id);
      CREATE INDEX IF NOT EXISTS idx_unit_prog_unit ON unit_process_progress(unit_code);

      -- PRD Production Command Center & WIP Tracing Engine Tables
      CREATE TABLE IF NOT EXISTS wip_travel_events (
        id TEXT PRIMARY KEY,
        wot_id TEXT,
        tag_number TEXT,
        project_id TEXT,
        event_type TEXT NOT NULL,
        from_station_id TEXT,
        from_process_id TEXT,
        to_station_id TEXT,
        to_process_id TEXT,
        machine_code TEXT,
        user_id TEXT,
        user_name TEXT,
        qty REAL DEFAULT 1,
        good_units REAL DEFAULT 1,
        reject_units REAL DEFAULT 0,
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        idempotency_key TEXT UNIQUE
      );

      CREATE INDEX IF NOT EXISTS idx_wip_events_tag ON wip_travel_events(tag_number);
      CREATE INDEX IF NOT EXISTS idx_wip_events_proj ON wip_travel_events(project_id);
      CREATE INDEX IF NOT EXISTS idx_wip_events_ts ON wip_travel_events(timestamp DESC);

      CREATE TABLE IF NOT EXISTS schedule_plans (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT DEFAULT 'BASELINE',
        capacity_profile_id TEXT,
        confidence_score REAL DEFAULT 85,
        snapshot_json TEXT NOT NULL,
        created_by TEXT,
        approved_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS adjustment_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        ref_id TEXT,
        project_id TEXT,
        scope TEXT DEFAULT 'STATION',
        window_from DATETIME,
        window_to DATETIME,
        severity TEXT DEFAULT 'MEDIUM',
        impact_snapshot_json TEXT,
        status TEXT DEFAULT 'DRAFT',
        created_by TEXT,
        approved_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS stop_line_events (
        id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        scope TEXT DEFAULT 'STATION',
        reason_code TEXT NOT NULL,
        reason_text TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        est_resume_at DATETIME,
        actual_resume_at DATETIME,
        lost_manhours REAL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        created_by TEXT,
        approved_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS capacity_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        hours_per_day REAL DEFAULT 8,
        shift_start INTEGER DEFAULT 8,
        shift_end INTEGER DEFAULT 17,
        work_on_saturday INTEGER DEFAULT 0,
        extra_shift_count INTEGER DEFAULT 0,
        effective_from TEXT,
        effective_to TEXT,
        is_baseline INTEGER DEFAULT 1,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS production_logs (
        id TEXT PRIMARY KEY,
        log_type TEXT NOT NULL,
        project_id TEXT,
        wot_id TEXT,
        station_id TEXT,
        process_id TEXT,
        machine_id TEXT,
        user_id TEXT,
        user_role TEXT NOT NULL,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        device_info TEXT,
        gps_location TEXT,
        details TEXT,
        photo_urls TEXT,
        is_verified INTEGER DEFAULT 0,
        verified_by TEXT,
        verified_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS floor_requests (
        id TEXT PRIMARY KEY,
        request_code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'NORMAL',
        status TEXT NOT NULL DEFAULT 'PENDING',
        requested_by TEXT NOT NULL,
        requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        station_id TEXT,
        project_id TEXT,
        process_id TEXT,
        wot_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        photo_urls TEXT,
        qty_required REAL,
        unit TEXT,
        bom_item_id TEXT,
        item_name TEXT,
        auto_pr INTEGER DEFAULT 0,
        pr_id TEXT,
        tool_item_id TEXT,
        requested_machine_category TEXT,
        reason TEXT,
        fulfilled_by TEXT,
        fulfilled_at DATETIME,
        fulfillment_notes TEXT,
        fulfillment_photo_urls TEXT,
        acknowledged_at DATETIME,
        acknowledged_by TEXT,
        in_progress_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS machine_schedules (
        id TEXT PRIMARY KEY,
        machine_id TEXT NOT NULL,
        project_id TEXT,
        station_id TEXT,
        process_id TEXT,
        wot_id TEXT,
        assigned_at DATETIME NOT NULL,
        released_at DATETIME,
        is_active INTEGER DEFAULT 1,
        bypass_station_lock INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wot_travel_logs (
        id TEXT PRIMARY KEY,
        wot_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        station_id TEXT,
        process_id TEXT,
        machine_id TEXT,
        user_id TEXT,
        user_name TEXT,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS stations (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        station_code TEXT,
        station_name TEXT,
        name TEXT,
        station_type TEXT DEFAULT 'SERIAL',
        machine_ids TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
  `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_manpower_status ON production_manpower(status);
      CREATE INDEX IF NOT EXISTS idx_manpower_shift ON production_manpower(shift);
      CREATE INDEX IF NOT EXISTS idx_manpower_spec ON production_manpower(specialization);
      CREATE INDEX IF NOT EXISTS idx_manpower_user ON production_manpower(user_username);
      CREATE INDEX IF NOT EXISTS idx_manpower_assign_mp ON production_manpower_assignments(manpower_id);
      CREATE INDEX IF NOT EXISTS idx_manpower_assign_proj ON production_manpower_assignments(project_id);
    `);

    safeExec(db, "ALTER TABLE stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE stations ADD COLUMN station_sequence INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE stations ADD COLUMN station_code TEXT;");

    safeExec(db, "ALTER TABLE production_stations ADD COLUMN station_sequence INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE production_stations ADD COLUMN station_code TEXT;");
    safeExec(db, "ALTER TABLE production_stations ADD COLUMN station_name TEXT;");
    safeExec(db, "ALTER TABLE production_stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");

    safeExec(db, "ALTER TABLE project_stations ADD COLUMN station_sequence INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN station_code TEXT;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN station_name TEXT;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");

    safeExec(db, "ALTER TABLE processes ADD COLUMN cycle_time_minutes REAL;");
    safeExec(db, "ALTER TABLE processes ADD COLUMN assigned_machine_id TEXT;");
    safeExec(db, "ALTER TABLE processes ADD COLUMN alternative_machine_ids TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE processes ADD COLUMN setup_time_minutes REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE processes ADD COLUMN teardown_time_minutes REAL DEFAULT 0;");

    safeExec(db, "ALTER TABLE wots ADD COLUMN qr_payload TEXT;");
    safeExec(db, "ALTER TABLE wots ADD COLUMN qr_image_url TEXT;");
    safeExec(db, "ALTER TABLE wots ADD COLUMN machine_id TEXT;");
    safeExec(db, "ALTER TABLE wots ADD COLUMN good_units INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE wots ADD COLUMN reject_units INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE wots ADD COLUMN rework_units INTEGER DEFAULT 0;");

    safeExec(db, "ALTER TABLE projects ADD COLUMN urgency TEXT DEFAULT 'NORMAL';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN priority INTEGER DEFAULT 3;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN spk_number TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN lot_size REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN qty REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN factory_factor REAL DEFAULT 85;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_status TEXT DEFAULT 'DRAFT';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_authorized_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_authorized_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_revision_note TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_status TEXT DEFAULT 'DRAFT';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_authorized_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_authorized_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_revision_note TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN is_master_set INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN master_set_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN start_date TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN committed_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN planned_completion_date TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN planned_total_hours REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN actual_total_hours REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN project_performance_factor REAL;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN execution_summary_json TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN shift_hours REAL DEFAULT 8;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN production_acceptance_status TEXT DEFAULT 'PENDING';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN production_accepted_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN production_accepted_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN production_acceptance_notes TEXT;");

    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN manpower_count INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN machine_efficiency_multiplier REAL DEFAULT 1.0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN eligible_operators_json TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN overtime_hours REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN qc_hold_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN rework_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN last_scanned_wot_id TEXT;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN last_scanned_at DATETIME;");

    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN current_bop_id TEXT;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN current_station_id TEXT;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN source_station_id TEXT;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN target_station_id TEXT;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN process_progress_json TEXT DEFAULT '{}';");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN last_scanned_at DATETIME;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN last_scanned_by TEXT;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN parent_wot_id TEXT;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN rework_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN qc_hold_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN split_sequence INTEGER DEFAULT 0;");

    safeExec(db, "ALTER TABLE project_manpower ADD COLUMN eligible_processes_json TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE project_manpower ADD COLUMN current_process_id TEXT;");
    safeExec(db, "ALTER TABLE project_manpower ADD COLUMN orchestration_reason TEXT DEFAULT 'INITIAL_ASSIGN';");

    safeExec(db, "ALTER TABLE work_centers ADD COLUMN code TEXT;");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN efficiency_index REAL DEFAULT 1.0;");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN status TEXT DEFAULT 'ACTIVE';");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN wip_limit INTEGER DEFAULT 20;");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN current_wip_count INTEGER DEFAULT 0;");

    safeExec(db, "ALTER TABLE lot_routing_executions ADD COLUMN scrap_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE lot_routing_executions ADD COLUMN good_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE lot_routing_executions ADD COLUMN operator_name TEXT;");
    safeExec(db, "ALTER TABLE lot_routing_executions ADD COLUMN end_time DATETIME;");
    safeExec(db, "ALTER TABLE lot_routing_executions ADD COLUMN start_time DATETIME;");

    // Adaptive Staggered SCM & Wave Orchestra Columns on BOMs
    safeExec(db, "ALTER TABLE boms ADD COLUMN bop_process_id TEXT;");
    safeExec(db, "ALTER TABLE boms ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE boms ADD COLUMN engineering_concession_type TEXT DEFAULT 'NONE';");
    safeExec(db, "ALTER TABLE boms ADD COLUMN substitute_item_id TEXT;");
    safeExec(db, "ALTER TABLE boms ADD COLUMN substitute_item_code TEXT;");
    safeExec(db, "ALTER TABLE boms ADD COLUMN substitute_item_name TEXT;");
    safeExec(db, "ALTER TABLE boms ADD COLUMN substitute_qty_supplied REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE boms ADD COLUMN deferred_status TEXT DEFAULT 'NONE';");
    safeExec(db, "ALTER TABLE boms ADD COLUMN concession_notes TEXT;");
    safeExec(db, "ALTER TABLE boms ADD COLUMN concession_authorized_by TEXT;");
    safeExec(db, "ALTER TABLE boms ADD COLUMN concession_authorized_at DATETIME;");

    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN machine_id TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN affected_machine_id TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN ndp_number TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN ndp_code TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN reschedule_required INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN estimated_down_hours REAL DEFAULT 48;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN down_started_at DATETIME;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN affected_item_id TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN affected_item_code TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN affected_item_name TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN ng_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN cascade_scope TEXT DEFAULT 'SINGLE_PROCESS';");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN parent_ndp_id TEXT;");

    safeExec(db, "ALTER TABLE ndps ADD COLUMN project_id TEXT;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN reschedule_required INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN affected_machine_id TEXT;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN machine_id TEXT;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN estimated_down_hours REAL DEFAULT 48;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN down_started_at DATETIME;");

    safeExec(db, `
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

    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN delivery_date TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN quotation_id TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN vehicle_plate TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN driver_name TEXT;");

    safeExec(db, "ALTER TABLE delivery_items ADD COLUMN delivery_id TEXT;");
    safeExec(db, "ALTER TABLE delivery_items ADD COLUMN item_code TEXT;");
    safeExec(db, "ALTER TABLE delivery_items ADD COLUMN item_name TEXT;");
    safeExec(db, "ALTER TABLE delivery_items ADD COLUMN qty_delivered REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE inventory ADD COLUMN min_stock REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE inventory ADD COLUMN max_stock REAL DEFAULT 0;");


    safeExec(db, "ALTER TABLE material_dispatches ADD COLUMN station_id TEXT;");

    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN request_date TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN requested_by TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN notes TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN cancelled_at DATETIME;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN archived INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN urgency TEXT DEFAULT 'NORMAL';");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN category TEXT DEFAULT 'PROJECT';");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN remarks TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN escalated_to TEXT;");
    try {
      db.exec(`
        UPDATE quotations
        SET grand_total = CASE WHEN (grand_total IS NULL OR grand_total = 0) THEN amount ELSE grand_total END,
            dpp = CASE 
              WHEN tax_rate > 0 AND (grand_total > 0 OR amount > 0) THEN CAST((COALESCE(NULLIF(grand_total, 0), amount) / (1 + tax_rate/100.0)) AS REAL)
              ELSE COALESCE(NULLIF(dpp, 0), amount)
            END,
            amount = CASE 
              WHEN tax_rate > 0 AND (grand_total > 0 OR amount > 0) THEN CAST((COALESCE(NULLIF(grand_total, 0), amount) / (1 + tax_rate/100.0)) AS REAL)
              ELSE amount
            END
        WHERE (dpp IS NULL OR dpp = 0 OR grand_total IS NULL OR grand_total = 0);
      `);
    } catch (e) {}
    safeExec(db, "ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE users ADD COLUMN level TEXT DEFAULT 'STAFF';");
    safeExec(db, "ALTER TABLE users ADD COLUMN last_seen_at TEXT;");
    safeExec(db, "ALTER TABLE users ADD COLUMN device_type TEXT DEFAULT 'Desktop';");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE hr_jobs ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE customers ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE customers ADD COLUMN contact_person TEXT;");
    safeExec(db, "ALTER TABLE customers ADD COLUMN npwp TEXT;");
    safeExec(db, "ALTER TABLE suppliers ADD COLUMN npwp TEXT;");
    safeExec(db, "ALTER TABLE suppliers ADD COLUMN tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN';");
    safeExec(db, "ALTER TABLE suppliers ADD COLUMN payment_terms TEXT DEFAULT 'Net 30 Days';");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN payment_terms TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN payment_method TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN';");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN dpp_nilai_lain REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN dpp_nilai_lain REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN payment_terms TEXT DEFAULT 'Net 30 Days';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN supplier_npwp TEXT;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN rounding_factor REAL DEFAULT 0;");
    safeExec(db, "UPDATE users SET is_approved = 1 WHERE status = 'APPROVED';");

    // Sales Order Items - add quantity / qty aliases
    safeExec(db, "ALTER TABLE sales_order_items ADD COLUMN quantity REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE sales_order_items ADD COLUMN qty REAL DEFAULT 1;");

    // NEW: Machine-Centric & QR-Driven Migrations
    safeExec(db, "ALTER TABLE items ADD COLUMN item_type TEXT DEFAULT 'MATERIAL' CHECK (item_type IN ('MATERIAL', 'TOOL', 'MACHINE', 'CONSUMABLE', 'OTHER'));");
    safeExec(db, "ALTER TABLE items ADD COLUMN machine_category TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN capacity_per_hour REAL;");
    safeExec(db, "ALTER TABLE items ADD COLUMN machine_status TEXT DEFAULT 'AVAILABLE' CHECK (machine_status IN ('AVAILABLE', 'ASSIGNED', 'RUNNING', 'MAINTENANCE', 'BROKEN', 'RETIRED'));");
    safeExec(db, "ALTER TABLE items ADD COLUMN bypass_multi_station INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN serial_number TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN manufacturer TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN machine_specifications TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN assigned_operator TEXT;");
    
    // Stations - add machine_ids array (JSON)
    safeExec(db, "ALTER TABLE production_stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");
    // Bill of Processes - add machine assignments
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN cycle_time_minutes REAL;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN manpower_allocated REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN assigned_machine_id TEXT REFERENCES items(id);");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN assigned_machine_ids_json TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN alternative_machine_ids TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN setup_time_minutes REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN teardown_time_minutes REAL DEFAULT 0;");

    // Initialize default 1-to-1 operator assignment on existing machines if not yet configured
    try {
      const defaultOps = [
        "Bambang Sudirman",
        "Agus Pratama",
        "Dedi Supriyanto",
        "Rian Hidayat",
        "Hendra Wijaya",
        "Fajar Nugroho",
        "Eko Prasetyo",
        "Wahyu Santoso",
      ];
      const existingMachines = db
        .prepare("SELECT id, assigned_operator, operational_status FROM items WHERE (type = 'MACHINE' OR item_type = 'MACHINE') AND deleted_at IS NULL ORDER BY item_code ASC")
        .all() as any[];
      const usedOps = new Set(
        existingMachines
          .map((m) => (m.assigned_operator || "").trim())
          .filter(Boolean)
      );
      let opIdx = 0;
      for (const m of existingMachines) {
        if (!m.assigned_operator && m.operational_status !== "INACTIVE") {
          while (opIdx < defaultOps.length && usedOps.has(defaultOps[opIdx])) {
            opIdx++;
          }
          if (opIdx < defaultOps.length) {
            const chosenOp = defaultOps[opIdx++];
            usedOps.add(chosenOp);
            db.prepare(
              "UPDATE items SET assigned_operator = ?, operational_status = 'ACTIVE', machine_status = 'ASSIGNED' WHERE id = ?"
            ).run(chosenOp, m.id);
          }
        }
      }
    } catch (e) {
      // ignore if table not ready yet
    }
    // WOTs - add QR and travel log fields
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN qr_payload TEXT;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN qr_image_url TEXT;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN machine_id TEXT REFERENCES items(id);");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN good_units INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN reject_units INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN rework_units INTEGER DEFAULT 0;");

    // Enhance NDPs
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN severity TEXT DEFAULT 'MEDIUM';");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN affected_machine_id TEXT REFERENCES items(id);");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN machine_lockdown_scope TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN material_request TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN ripple_analysis TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN resolution_type TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN resolution_notes TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN verified_by_qc INTEGER DEFAULT 0;");

    // Performance Indexing
    safeExec(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_consumption_unique ON bom_item_consumption(bom_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_hr_applications_email ON hr_applications(email);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_hr_attendances_emp ON hr_attendances(employee_username);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_hr_kpis_emp ON hr_kpis(employee_username);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pr_project ON purchase_requests(project_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_po_pr ON purchase_orders(pr_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_projects_quotation ON projects(quotation_id);");

    safeExec(db, "ALTER TABLE work_centers ADD COLUMN efficiency_index REAL DEFAULT 1.0;");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN status TEXT DEFAULT 'ACTIVE';");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN wip_limit INTEGER DEFAULT 20;");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN current_wip_count INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_orders ADD COLUMN current_work_center_id TEXT;");
    safeExec(db, "ALTER TABLE work_orders ADD COLUMN current_step_sequence INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_orders ADD COLUMN wip_status TEXT DEFAULT 'IN_BUFFER';");
    safeExec(db, "ALTER TABLE pr_items ADD COLUMN expected_delivery_date TEXT;");
    safeExec(db, "ALTER TABLE project_tasks ADD COLUMN pr_id TEXT;");
    safeExec(db, "ALTER TABLE project_tasks ADD COLUMN po_id TEXT;");
    safeExec(db, "ALTER TABLE project_tasks ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN is_master_set INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN master_set_at DATETIME;");
    // Migrate existing projects table to add quotation_id, spk_id, and ntp_id columns
    safeExec(db, "ALTER TABLE projects ADD COLUMN quotation_id TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN spk_id TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN ntp_id TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN qty REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN uom TEXT DEFAULT 'Unit';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN quotation_item_id TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_status TEXT DEFAULT 'DRAFT';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_revision_note TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_authorized_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_authorized_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_prepared_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_prepared_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_submitted_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_submitted_at DATETIME;");
    
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE production_manpower_assignments ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE production_manpower ADD COLUMN default_station_id TEXT;");
    
    // Add indices for new relations
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_bop_station ON bill_of_processes(station_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_manpower_assign_station ON production_manpower_assignments(station_id);");

    // BOP Approval & ECO tracking
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_status TEXT DEFAULT 'DRAFT';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_revision_note TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_authorized_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_authorized_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_prepared_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_prepared_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_submitted_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_submitted_at DATETIME;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN police_number TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN authorized_at DATETIME;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN authorized_by TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN quotation_id TEXT;");

    // Post-creation fallback schema checks to guarantee columns exist
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN spk_id TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN cancelled_at DATETIME;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN archived INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN urgency TEXT DEFAULT 'NORMAL';");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN remarks TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN escalated_to TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN category TEXT DEFAULT 'PROJECT';");

    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN cancelled_at DATETIME;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN archived INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN urgency TEXT DEFAULT 'NORMAL';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN escalated_to TEXT;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN amount_paid REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN payment_status TEXT DEFAULT 'UNPAID';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN vendor_invoice_number TEXT;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN vendor_invoice_amount REAL;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN tax_category TEXT DEFAULT 'GOODS';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN ppn_rate REAL DEFAULT 12;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN pph_rate REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN dpp REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN ppn REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN pph REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN grand_total REAL DEFAULT 0;");

    safeExec(db, "ALTER TABLE quotations ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN tax_rate REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN discount_rate REAL DEFAULT 0;");

    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE pr_items ADD COLUMN revision_note TEXT;");

    // Safe column migrations

    // Production Logger & Machine Resource Scheduling (Section 12)
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN station_sequence INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN working_hours REAL DEFAULT 8.0;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN status TEXT DEFAULT 'IDLE';");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN current_oee REAL DEFAULT 100.0;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN is_paused INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN work_center TEXT;");

    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN completed_units INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN total_downtime_minutes REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN running_elapsed_seconds REAL DEFAULT 0;");

    safeExec(db, "ALTER TABLE production_manpower_assignments ADD COLUMN eligible_processes TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE production_manpower_assignments ADD COLUMN current_process_id TEXT;");
    safeExec(db, "ALTER TABLE production_manpower_assignments ADD COLUMN task_progress TEXT DEFAULT 'IDLE';");

    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN related_pr_id TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN requires_procurement INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN resolved_by TEXT;");

    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN related_ndp_id TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN source TEXT DEFAULT 'PROJECT';");

    safeExec(db, `
      CREATE TABLE IF NOT EXISTS production_wot_genealogy (
        id TEXT PRIMARY KEY,
        wot_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        station_id TEXT,
        process_id TEXT,
        operator_id TEXT,
        operator_name TEXT,
        timestamp_in DATETIME DEFAULT CURRENT_TIMESTAMP,
        timestamp_out DATETIME,
        yield_qty REAL DEFAULT 1,
        scrap_qty REAL DEFAULT 0,
        material_batch TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wot_id) REFERENCES work_order_tickets(id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_genealogy_wot ON production_wot_genealogy(wot_id);
      CREATE INDEX IF NOT EXISTS idx_genealogy_proj ON production_wot_genealogy(project_id);

      CREATE TABLE IF NOT EXISTS wot_history (
        id TEXT PRIMARY KEY,
        wot_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        process_id TEXT NOT NULL,
        station_id TEXT,
        operator_name TEXT,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        qty INTEGER DEFAULT 1,
        scrap_qty INTEGER DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (wot_id) REFERENCES work_order_tickets(id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_wot_history_wot ON wot_history(wot_id);
      CREATE INDEX IF NOT EXISTS idx_wot_history_proj ON wot_history(project_id);

      CREATE TABLE IF NOT EXISTS project_overtime_schedules (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        manpower_id TEXT NOT NULL,
        station_id TEXT,
        date TEXT NOT NULL,
        overtime_hours REAL NOT NULL DEFAULT 2,
        reason TEXT,
        status TEXT DEFAULT 'APPROVED',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (manpower_id) REFERENCES production_manpower(id)
      );
      CREATE INDEX IF NOT EXISTS idx_overtime_proj ON project_overtime_schedules(project_id);
      CREATE INDEX IF NOT EXISTS idx_overtime_mp ON project_overtime_schedules(manpower_id);
    `);

    safeExec(db, "ALTER TABLE production_manpower ADD COLUMN user_username TEXT;");
    safeExec(db, "ALTER TABLE project_overtime_schedules ADD COLUMN hourly_rate REAL DEFAULT 45000;");
    safeExec(db, "ALTER TABLE project_overtime_schedules ADD COLUMN estimated_cost REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE payroll_requisitions ADD COLUMN total_direct_labor REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE payroll_requisitions ADD COLUMN total_opex REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN total_direct_labor REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN total_opex REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE production_manpower ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE production_manpower_assignments ADD COLUMN target_end_date TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN spk_number TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN completed_at DATETIME;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN resolved_at DATETIME;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN resumed_at DATETIME;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN node_type TEXT DEFAULT 'PROCESS';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN completed_by_operator TEXT;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN completed_at_timestamp DATETIME;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN cycle_time_minutes REAL DEFAULT 10.0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN completed_qty INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN qc_criteria TEXT;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN sop_instruction TEXT;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN bom_allocations TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN material_allocations TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN machine_id TEXT;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN is_machine_shared INTEGER DEFAULT 0;");
        safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN lifecycle_status TEXT DEFAULT 'Planned';");
        safeExec(db, "ALTER TABLE project_stations ADD COLUMN station_sequence INTEGER DEFAULT 0;");
        safeExec(db, "ALTER TABLE project_stations ADD COLUMN cycle_time_minutes REAL DEFAULT 0;");


        safeExec(db, "ALTER TABLE product_node_lifecycle ADD COLUMN dispatch_id TEXT;");
        safeExec(db, "ALTER TABLE product_node_lifecycle ADD COLUMN received_by_production_at DATETIME;");
        safeExec(db, "ALTER TABLE product_node_lifecycle ADD COLUMN received_by_production_user TEXT;");

    safeExec(db, "ALTER TABLE boms ADD COLUMN received_by_production REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN expected_yield_rate REAL DEFAULT 100.0;");
    
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN is_manual_pause INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN pause_type TEXT DEFAULT 'NONE';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN lot_size INTEGER DEFAULT 50;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN transfer_mode TEXT DEFAULT 'INTER_STATION';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN process_status TEXT DEFAULT 'PLANNED';");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN bop_step_id TEXT;");
    safeExec(db, "ALTER TABLE project_tasks ADD COLUMN is_manual_pause INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_tasks ADD COLUMN pause_type TEXT DEFAULT 'NONE';");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN delivery_type TEXT DEFAULT 'FULL';");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN is_partial INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE production_lots ADD COLUMN notes TEXT;");
    safeExec(db, "ALTER TABLE production_lots ADD COLUMN eco_revision TEXT;");
    safeExec(db, "ALTER TABLE task_travel_tags ADD COLUMN lot_id TEXT;");
    safeExec(db, "ALTER TABLE task_travel_tags ADD COLUMN lot_number TEXT;");

    // Project HPP (Pure Material vs Full Costing) columns
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN material_cogs REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN full_cogs REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN gross_profit_material REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN gross_margin_material_pct REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN gross_profit_full REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN gross_margin_full_pct REAL DEFAULT 0;");

}
