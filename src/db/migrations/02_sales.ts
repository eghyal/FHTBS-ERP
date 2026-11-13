import { safeExec } from "./runner.ts";

export function runCrmSalesAndShopMigrations(db: any) {
  db.exec(`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        total_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        created_by_id TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sales_order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        qty REAL DEFAULT 1,
        unit_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES sales_orders(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        npwp TEXT,
        customer_type TEXT DEFAULT 'B2B',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS delivery_notes (
        id TEXT PRIMARY KEY,
        dn_number TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        project_id TEXT,
        status TEXT DEFAULT 'DRAFT', -- DRAFT, PENDING_DELIVERY, IN_DELIVERY, DELIVERED
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        authorized_by TEXT,
        police_number TEXT,
        shipped_at DATETIME,
        delivered_at DATETIME,
        invoiced_at DATETIME,
        remarks TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS delivery_items (
        id TEXT PRIMARY KEY,
        dn_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        qty REAL NOT NULL,
        uom TEXT NOT NULL,
        remarks TEXT,
        FOREIGN KEY (dn_id) REFERENCES delivery_notes(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS dn_signatures (
        id TEXT PRIMARY KEY,
        dn_id TEXT NOT NULL,
        role TEXT NOT NULL,
        signer_name TEXT,
        file_url TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dn_id) REFERENCES delivery_notes(id)
      );

      CREATE TABLE IF NOT EXISTS delivery_receipts (
        id TEXT PRIMARY KEY,
        receipt_number TEXT UNIQUE NOT NULL,
        dn_id TEXT,
        customer_id TEXT,
        customer_name TEXT,
        received_by TEXT NOT NULL,
        delivered_by TEXT,
        authorized_by TEXT,
        receipt_date TEXT NOT NULL,
        status TEXT DEFAULT 'VALIDATED',
        condition_summary TEXT DEFAULT 'Goods received in complete count and good condition.',
        notes TEXT,
        digital_signature TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dn_id) REFERENCES delivery_notes(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );

      CREATE TABLE IF NOT EXISTS delivery_receipt_items (
        id TEXT PRIMARY KEY,
        receipt_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        qty REAL NOT NULL,
        uom TEXT DEFAULT 'PCS',
        condition TEXT DEFAULT 'GOOD',
        remarks TEXT,
        FOREIGN KEY (receipt_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS commercial_invoices (
        id TEXT PRIMARY KEY,
        ci_number TEXT UNIQUE NOT NULL,
        dn_id TEXT NOT NULL UNIQUE,
        customer_id TEXT NOT NULL,
        project_id TEXT,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'UNPAID', -- UNPAID, PAID
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        paid_at DATETIME,
        bank_account_id TEXT,
        payment_terms TEXT DEFAULT 'Net 30',
        job_description TEXT,
        amount_paid REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'UNPAID',
        ppn REAL DEFAULT 0,
        pph REAL DEFAULT 0,
        ppn_rate REAL DEFAULT 12,
        pph_rate REAL DEFAULT 2,
        total_amount REAL DEFAULT 0,
        gross_amount REAL DEFAULT 0,
        discount_rate REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        dpp REAL DEFAULT 0,
        rounding_factor REAL DEFAULT 0,
        grand_total REAL DEFAULT 0,
        sales_channel TEXT DEFAULT 'B2B_PROJECT',
        receipt_number TEXT,
        payment_method TEXT,
        payment_reference TEXT,
        is_direct_settled INTEGER DEFAULT 0,
        FOREIGN KEY (dn_id) REFERENCES delivery_notes(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
      );
  `);
    safeExec(db, "CREATE TABLE IF NOT EXISTS manufacturing_spks (id TEXT PRIMARY KEY, spk_number TEXT, project_id TEXT, customer_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);");
    // Create quotations, spks, and ntps tables
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS quotations (
        id TEXT PRIMARY KEY,
        quotation_number TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        validity_days INTEGER DEFAULT 20,
        status TEXT DEFAULT 'APPROVED', -- APPROVED, PROCESSED, EXPIRED
        revision_note TEXT,
        tax_rate REAL DEFAULT 0,
        discount_rate REAL DEFAULT 0,
        npwp_tax_id TEXT,
        pph_rate REAL DEFAULT 0,
        dpp REAL DEFAULT 0,
        dpp_nilai_lain REAL DEFAULT 0,
        tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN',
        payment_terms TEXT,
        payment_method TEXT,
        rounding_factor REAL DEFAULT 0,
        grand_total REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        remarks TEXT,
        archived_at DATETIME,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS quotation_items (
        id TEXT PRIMARY KEY,
        quotation_id TEXT NOT NULL,
        title TEXT NOT NULL,
        qty REAL DEFAULT 1,
        uom TEXT DEFAULT 'Unit',
        unit_price REAL DEFAULT 0,
        revision_note TEXT,
        FOREIGN KEY (quotation_id) REFERENCES quotations(id)
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS spks (
        id TEXT PRIMARY KEY,
        spk_number TEXT UNIQUE NOT NULL,
        project_id TEXT,
        quotation_id TEXT,
        title TEXT NOT NULL,
        due_date TEXT,
        target_completion_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'APPROVED',
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (quotation_id) REFERENCES quotations(id)
      );
    `,
    ).run();
    safeExec(db, "ALTER TABLE spks ADD COLUMN due_date TEXT;");
    safeExec(db, "ALTER TABLE spks ADD COLUMN target_completion_date TEXT;");

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS ntps (
        id TEXT PRIMARY KEY,
        ntp_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        quotation_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'ISSUED',
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (quotation_id) REFERENCES quotations(id)
      );
    `,
    ).run();

    db.exec(
      `
      CREATE TABLE IF NOT EXISTS crm_leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_info TEXT NOT NULL,
        intent TEXT,
        status TEXT DEFAULT 'NEW',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS potential_customers (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        auth_provider TEXT DEFAULT 'FORM',
        avatar_url TEXT,
        cart_snapshot TEXT,
        cart_total_value REAL DEFAULT 0,
        cart_total_items INTEGER DEFAULT 0,
        status TEXT DEFAULT 'NEW_INTENT',
        potential_score INTEGER DEFAULT 0,
        persona_tag TEXT DEFAULT 'Unverified',
        buying_power_est TEXT,
        scout_summary TEXT,
        scout_company TEXT,
        scout_role TEXT,
        scout_sources TEXT,
        scout_recommendations TEXT,
        scouted_at DATETIME,
        last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sales_notes TEXT,
        assigned_to TEXT,
        converted_order_id TEXT,
        visitor_session_id TEXT,
        activity_count INTEGER DEFAULT 0,
        customer_segment TEXT DEFAULT 'CART_ACTIVE',
        lifecycle_stage TEXT DEFAULT 'LEAD',
        lead_grade TEXT DEFAULT 'C',
        scout_status TEXT DEFAULT 'NOT_SCOUTED',
        fit_score INTEGER DEFAULT 0,
        intent_score INTEGER DEFAULT 0,
        reachability_score INTEGER DEFAULT 0,
        profiling_consent INTEGER DEFAULT 1,
        marketing_consent INTEGER DEFAULT 1,
        terms_accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        privacy_policy_version TEXT DEFAULT 'v1.0',
        consent_withdrawn_at DATETIME,
        lead_score_breakdown TEXT,
        scout_confidence TEXT DEFAULT 'MEDIUM',
        key_talking_points TEXT,
        recommended_products TEXT,
        risk_flags TEXT,
        sources_json TEXT,
        scout_triggered_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customer_consents (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        consent_type TEXT NOT NULL,
        granted INTEGER NOT NULL,
        policy_version TEXT NOT NULL,
        granted_at DATETIME,
        withdrawn_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS scout_jobs (
        id TEXT PRIMARY KEY,
        job_type TEXT DEFAULT 'MANUAL',
        status TEXT DEFAULT 'QUEUED',
        customer_ids TEXT NOT NULL,
        triggered_by TEXT,
        progress INTEGER DEFAULT 0,
        error_log TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS outreach_activities (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        template_id TEXT,
        custom_note TEXT,
        sent_by TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'SENT',
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS ai_feedback (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        field TEXT NOT NULL,
        flag TEXT NOT NULL,
        note TEXT,
        flagged_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS erasure_requests (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        reason TEXT,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'QUEUED',
        completed_at DATETIME,
        propagated_tables TEXT
      );

      CREATE TABLE IF NOT EXISTS scout_icp_config (
        id TEXT PRIMARY KEY,
        company_name TEXT,
        target_industries TEXT,
        target_buyer_personas TEXT,
        priority_products TEXT,
        scoring_weights TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS visitor_activities (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        customer_id TEXT,
        module TEXT NOT NULL,
        activity_type TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT,
        page_url TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    );

    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_status ON potential_customers(status);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_score ON potential_customers(potential_score);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_grade ON potential_customers(lead_grade);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_segment ON potential_customers(customer_segment);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_scout_status ON potential_customers(scout_status);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_consent ON potential_customers(profiling_consent);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_created ON potential_customers(created_at);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_session ON potential_customers(visitor_session_id);");

    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_cust_consents_cust ON customer_consents(customer_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_outreach_cust ON outreach_activities(customer_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_feedback_cust ON ai_feedback(customer_id);");

    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_vis_act_session ON visitor_activities(session_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_vis_act_customer ON visitor_activities(customer_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_vis_act_created ON visitor_activities(created_at);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_vis_act_module ON visitor_activities(module);");

    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN visitor_session_id TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN activity_count INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN customer_segment TEXT DEFAULT 'CART_ACTIVE';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN lifecycle_stage TEXT DEFAULT 'LEAD';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN lead_grade TEXT DEFAULT 'C';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN scout_status TEXT DEFAULT 'NOT_SCOUTED';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN fit_score INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN intent_score INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN reachability_score INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN profiling_consent INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN marketing_consent INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN terms_accepted_at DATETIME;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN privacy_policy_version TEXT DEFAULT 'v1.0';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN consent_withdrawn_at DATETIME;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN lead_score_breakdown TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN scout_confidence TEXT DEFAULT 'MEDIUM';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN key_talking_points TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN recommended_products TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN risk_flags TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN sources_json TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN scout_triggered_by TEXT;");

    // Add missing commercial_invoices columns
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN bank_account_id TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN payment_terms TEXT DEFAULT 'Net 30';");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN job_description TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN amount_paid REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN payment_status TEXT DEFAULT 'UNPAID';");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN ppn REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN pph REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN ppn_rate REAL DEFAULT 12;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN pph_rate REAL DEFAULT 2;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN total_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN gross_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN discount_rate REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN discount_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN dpp REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN rounding_factor REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN grand_total REAL DEFAULT 0;");
    // B2C E-Commerce Shop columns on items
    safeExec(db, "ALTER TABLE items ADD COLUMN is_published_shop INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_image_url TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_gallery_urls TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_promo_price REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_weight_kg REAL DEFAULT 2.5;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_badge TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_featured INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_availability_type TEXT DEFAULT 'AUTO';");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_lead_time_days INTEGER DEFAULT 3;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_moq REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_specs TEXT;");

    // Alter shop_orders safe column expansions
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN is_dp INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN dp_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN delivery_distance REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN payment_proof_url TEXT;");

    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        delivery_address TEXT NOT NULL,
        delivery_city TEXT,
        delivery_method TEXT NOT NULL DEFAULT 'DELIVERY',
        shipping_cost REAL DEFAULT 0,
        subtotal_amount REAL NOT NULL,
        total_amount REAL NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'TRANSFER_MANUAL',
        payment_status TEXT NOT NULL DEFAULT 'UNPAID',
        order_status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
        payment_proof_url TEXT,
        payment_ref TEXT,
        tracking_number TEXT,
        fleet_notes TEXT,
        delivery_note_id TEXT,
        customer_notes TEXT,
        is_dp INTEGER DEFAULT 0,
        dp_amount REAL DEFAULT 0,
        delivery_distance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        paid_at DATETIME,
        dispatched_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS shop_order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_code TEXT NOT NULL,
        item_name TEXT NOT NULL,
        uom TEXT NOT NULL,
        qty REAL NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        weight_kg REAL DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE CASCADE
      );
    `);
    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN unit_price REAL DEFAULT 0;");

    // Unified B2B & B2C Sales Migrations
    safeExec(db, "ALTER TABLE items ADD COLUMN barcode TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN selling_price REAL;");
    safeExec(db, "ALTER TABLE customers ADD COLUMN customer_type TEXT DEFAULT 'B2B';");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN sales_channel TEXT DEFAULT 'B2B_PROJECT';");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN settlement_type TEXT DEFAULT 'CREDIT_TERM';");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN receipt_number TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN customer_name_manual TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN customer_phone_manual TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN payment_reference TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN cash_tendered REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN change_due REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN paid_at DATETIME;");
    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN item_id TEXT;");
    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN barcode TEXT;");
    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN discount_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN sales_channel TEXT DEFAULT 'B2B_PROJECT';");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN receipt_number TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN payment_method TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN payment_reference TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN is_direct_settled INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN bank_account_id TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN payment_terms TEXT DEFAULT 'Net 30';");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN job_description TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE pr_items ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN tax_rate REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN discount_rate REAL DEFAULT 0;");

    // NTP Migrations (Renaming NTC to NTP)
    safeExec(db, "ALTER TABLE ntcs RENAME TO ntps;");
    safeExec(db, "ALTER TABLE ntps RENAME COLUMN ntc_number TO ntp_number;");
    safeExec(db, "ALTER TABLE projects RENAME COLUMN ntc_id TO ntp_id;");

    // =========================================================================
    // OMNICHANNEL B2B & B2C BUSINESS SCHEMA ENHANCEMENTS
    // 1. Unified Customer & Lead Identity + Credit Limit Governance
    // 2. B2C Make-to-Order (MTO) -> SPK Production Integration
    // 3. Standardized DPP Nilai Lain (PMK 131/2024) & Down Payment (DP) Settlement
    // =========================================================================
    safeExec(db, "ALTER TABLE customers ADD COLUMN customer_segment TEXT DEFAULT 'B2B';");
    safeExec(db, "ALTER TABLE customers ADD COLUMN credit_limit REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE customers ADD COLUMN payment_terms_days INTEGER DEFAULT 30;");
    safeExec(db, "ALTER TABLE customers ADD COLUMN source_lead_id TEXT;");
    safeExec(db, "ALTER TABLE customers ADD COLUMN source_potential_id TEXT;");

    safeExec(db, "ALTER TABLE crm_leads ADD COLUMN customer_id TEXT;");
    safeExec(db, "ALTER TABLE crm_leads ADD COLUMN email TEXT;");
    safeExec(db, "ALTER TABLE crm_leads ADD COLUMN phone TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN customer_id TEXT;");

    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN customer_id TEXT;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN dpp_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN dpp_nilai_lain REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN ppn_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN';");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN fulfillment_mode TEXT DEFAULT 'MTS';");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN production_status TEXT DEFAULT 'NOT_REQUIRED';");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN project_id TEXT;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN spk_number TEXT;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN dp_invoice_id TEXT;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN final_invoice_id TEXT;");

    safeExec(db, "ALTER TABLE shop_order_items ADD COLUMN fulfillment_type TEXT DEFAULT 'READY_STOCK';");
    safeExec(db, "ALTER TABLE shop_order_items ADD COLUMN mto_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE shop_order_items ADD COLUMN estimated_lead_days INTEGER DEFAULT 0;");

    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN invoice_category TEXT DEFAULT 'STANDARD';");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN parent_invoice_id TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN dp_deduction_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN dpp_nilai_lain REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN quotation_id TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN shop_order_id TEXT;");

    safeExec(db, "ALTER TABLE quotations ADD COLUMN dp_percentage REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN dp_invoice_id TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN credit_override_reason TEXT;");
}
