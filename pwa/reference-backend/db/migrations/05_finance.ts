import { safeExec } from "./runner.ts";

export function runFinanceAndAccountingMigrations(db: any) {
  db.exec(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        entry_number TEXT UNIQUE NOT NULL,
        entry_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        reference_type TEXT NOT NULL,
        reference_id TEXT,
        reference_number TEXT,
        description TEXT NOT NULL,
        total_debit REAL DEFAULT 0,
        total_credit REAL DEFAULT 0,
        status TEXT DEFAULT 'POSTED',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS journal_entry_lines (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        account_code TEXT NOT NULL,
        account_name TEXT NOT NULL,
        debit REAL DEFAULT 0,
        credit REAL DEFAULT 0,
        memo TEXT,
        FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS project_financial_summaries (
        project_id TEXT PRIMARY KEY,
        total_revenue REAL DEFAULT 0,
        total_bom_cost REAL DEFAULT 0,
        total_labor_cost REAL DEFAULT 0,
        total_overhead_cost REAL DEFAULT 0,
        total_cogs REAL DEFAULT 0,
        gross_profit REAL DEFAULT 0,
        gross_margin_pct REAL DEFAULT 0,
        material_cogs REAL DEFAULT 0,
        full_cogs REAL DEFAULT 0,
        gross_profit_material REAL DEFAULT 0,
        gross_margin_material_pct REAL DEFAULT 0,
        gross_profit_full REAL DEFAULT 0,
        gross_margin_full_pct REAL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
      
      CREATE TABLE IF NOT EXISTS finance_monthly_summaries (
        month_year TEXT PRIMARY KEY, -- e.g. "Aug 26"
        revenue REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        cogs REAL DEFAULT 0,
        material_cogs REAL DEFAULT 0,
        labor_cogs REAL DEFAULT 0,
        opex REAL DEFAULT 0,
        profit REAL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS finance_global_summary (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        total_receivable REAL DEFAULT 0,
        total_payable REAL DEFAULT 0,
        total_billed REAL DEFAULT 0,
        total_revenue_realized REAL DEFAULT 0,
        total_tax_collected REAL DEFAULT 0,
        total_cogs REAL DEFAULT 0,
        total_material_cogs REAL DEFAULT 0,
        total_labor_cogs REAL DEFAULT 0,
        total_opex REAL DEFAULT 0,
        gross_margin REAL DEFAULT 0,
        net_profit REAL DEFAULT 0,
        operating_margin REAL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );
  `);
    safeExec(db, `
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id TEXT PRIMARY KEY,
        bank_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        account_holder TEXT NOT NULL,
        branch TEXT,
        account_type TEXT DEFAULT 'OPERATIONAL',
        currency TEXT DEFAULT 'IDR',
        balance REAL DEFAULT 0,
        is_primary INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN description TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN photo_urls TEXT;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN bop_id TEXT;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN station_id TEXT;");
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS finance_transactions (
        id TEXT PRIMARY KEY,
        transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        type TEXT NOT NULL CHECK(type IN ('IN', 'OUT')),
        category TEXT NOT NULL CHECK(category IN ('RECEIVABLE', 'PAYABLE', 'PAYROLL', 'GENERAL', 'CONSUMABLE', 'OTHERS', 'TRANSPORTATION')),
        reference_id TEXT,
        amount REAL NOT NULL,
        payment_method TEXT,
        notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS accounting_periods (
        id TEXT PRIMARY KEY,
        period_key TEXT UNIQUE NOT NULL, -- e.g. "2026-09"
        period_name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT CHECK(status IN ('OPEN', 'SOFT_LOCKED', 'HARD_CLOSED')) DEFAULT 'OPEN',
        locked_by TEXT,
        locked_at DATETIME,
        closed_by TEXT,
        closed_at DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
        type TEXT DEFAULT 'CURRENT',
        normal_balance TEXT CHECK(normal_balance IN ('DEBIT', 'CREDIT')) DEFAULT 'DEBIT',
        description TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    ).run();

    // Finance Rollup COGS breakdown (Material vs Full)
    safeExec(db, "ALTER TABLE finance_global_summary ADD COLUMN total_material_cogs REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE finance_global_summary ADD COLUMN total_labor_cogs REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE finance_monthly_summaries ADD COLUMN material_cogs REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE finance_monthly_summaries ADD COLUMN labor_cogs REAL DEFAULT 0;");

}
