import Database from "better-sqlite3";
import { safeExec } from "./runner.ts";

// Initialize standalone HR Attendance Database (Sharding for high concurrency writes)
export const initAttendanceDb = (attendanceDbPath: string) => {
  const hrDb = new Database(attendanceDbPath, { timeout: 15000 });
  hrDb.pragma("journal_mode = WAL");
  hrDb.pragma("synchronous = NORMAL");
  hrDb.exec(`
    CREATE TABLE IF NOT EXISTS hr_attendances (
      id TEXT PRIMARY KEY,
      employee_username TEXT NOT NULL,
      date TEXT NOT NULL,
      clock_in TEXT,
      clock_in_location TEXT,
      clock_out TEXT,
      clock_out_location TEXT,
      status TEXT CHECK(status IN ('PRESENT', 'ABSENT', 'LATE', 'LEAVE')) DEFAULT 'PRESENT',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_attendances_emp ON hr_attendances(employee_username);
    CREATE INDEX IF NOT EXISTS idx_attendances_date ON hr_attendances(date);
  `);
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN clock_in_location TEXT;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN clock_out_location TEXT;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN shift TEXT DEFAULT 'SHIFT_1';");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN project_id TEXT;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN work_hours REAL DEFAULT 0;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN overtime_hours REAL DEFAULT 0;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN overtime_status TEXT DEFAULT 'NONE';");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN overtime_reason TEXT;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN hourly_rate REAL DEFAULT 0;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN labor_cost REAL DEFAULT 0;");
  hrDb.close();
};

export function runHrisAndHcmMigrations(db: any) {
    // Migrate existing attendances from main DB to shard if necessary
    try {
      db.exec(`
        INSERT OR IGNORE INTO attendance_db.hr_attendances
        SELECT * FROM main.hr_attendances;
        DROP TABLE IF EXISTS main.hr_attendances;
      `);
    } catch (e) {
      // Ignored if migration already done or table doesn't exist
    }
    // 2.1 Human Resource Tables
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_jobs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        department TEXT NOT NULL,
        location TEXT DEFAULT 'Head Office',
        status TEXT CHECK(status IN ('OPEN', 'CLOSED')) DEFAULT 'OPEN',
        type TEXT DEFAULT 'Full-time',
        description TEXT NOT NULL,
        requirements TEXT,
        benefits TEXT,
        salary_string TEXT,
        pamphlet_bg_color TEXT DEFAULT '#1c1917',
        pamphlet_accent_color TEXT DEFAULT '#ca8a04',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_applications (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        linkedin_url TEXT,
        experience TEXT,
        resume_text TEXT,
        status TEXT CHECK(status IN ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER_MADE', 'ACCEPTED', 'REJECTED')) DEFAULT 'APPLIED',
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        onboarding_token TEXT,
        token_used INTEGER DEFAULT 0,
        archived_at DATETIME,
        FOREIGN KEY (job_id) REFERENCES hr_jobs(id) ON DELETE CASCADE
      );
    `,
    ).run();

    safeExec(db, "ALTER TABLE hr_jobs ADD COLUMN headcount_quota INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE hr_jobs ADD COLUMN hired_count INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE hr_jobs ADD COLUMN salary_min REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE hr_jobs ADD COLUMN salary_max REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE hr_jobs ADD COLUMN employment_type_default TEXT DEFAULT 'PKWT';");
    safeExec(db, "ALTER TABLE hr_jobs ADD COLUMN target_work_center_id TEXT;");
    safeExec(db, "ALTER TABLE hr_jobs ADD COLUMN closing_date TEXT;");

    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN onboarding_token TEXT;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN token_used INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN interview_date TEXT;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN interviewer_name TEXT;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN score_technical INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN score_communication INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN score_reliability INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN score_culture_fit INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN interview_overall_score REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN offered_basic_salary REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN offered_allowances REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN contract_type TEXT DEFAULT 'PKWT';");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN contract_duration_months INTEGER DEFAULT 12;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN planned_join_date TEXT;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN nik_ktp TEXT;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN npwp TEXT;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN ptkp_status TEXT DEFAULT 'TK/0';");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN bank_name TEXT;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN bank_account_number TEXT;");

    safeExec(db, "ALTER TABLE users ADD COLUMN employee_no TEXT;");
    safeExec(db, "ALTER TABLE users ADD COLUMN nik_ktp TEXT;");
    safeExec(db, "ALTER TABLE users ADD COLUMN npwp TEXT;");
    safeExec(db, "ALTER TABLE users ADD COLUMN ptkp_status TEXT DEFAULT 'TK/0';");
    safeExec(db, "ALTER TABLE users ADD COLUMN bank_name TEXT;");
    safeExec(db, "ALTER TABLE users ADD COLUMN bank_account_number TEXT;");
    safeExec(db, "ALTER TABLE users ADD COLUMN contract_type TEXT DEFAULT 'PKWT';");
    safeExec(db, "ALTER TABLE users ADD COLUMN join_date TEXT;");
    safeExec(db, "ALTER TABLE users ADD COLUMN contract_end_date TEXT;");
    safeExec(db, "ALTER TABLE users ADD COLUMN work_center_id TEXT;");

    safeExec(db, "ALTER TABLE production_manpower ADD COLUMN work_center_id TEXT;");

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_kpis (
        id TEXT PRIMARY KEY,
        employee_username TEXT NOT NULL,
        evaluator_username TEXT NOT NULL,
        period_name TEXT NOT NULL,
        score_communication INTEGER DEFAULT 0,
        score_productivity INTEGER DEFAULT 0,
        score_reliability INTEGER DEFAULT 0,
        score_leadership INTEGER DEFAULT 0,
        score_technical INTEGER DEFAULT 0,
        overall_score REAL DEFAULT 0,
        evaluation_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_username) REFERENCES users(username),
        FOREIGN KEY (evaluator_username) REFERENCES users(username)
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS finance_payroll (
        id TEXT PRIMARY KEY,
        prq_id TEXT,
        voucher_number TEXT,
        period_name TEXT NOT NULL,
        period_month INTEGER,
        period_year INTEGER,
        total_amount REAL NOT NULL,
        status TEXT CHECK(status IN ('DRAFTED', 'AUTHORIZED', 'PAID')) DEFAULT 'DRAFTED',
        details_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        paid_at DATETIME
      );
    `,
    ).run();

    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN prq_id TEXT;");
    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN voucher_number TEXT;");
    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN period_month INTEGER;");
    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN period_year INTEGER;");

    // Create Payroll Requisitions (PRq) table for HR Submission Workflow
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS payroll_requisitions (
        id TEXT PRIMARY KEY,
        requisition_number TEXT UNIQUE NOT NULL,
        period_month INTEGER NOT NULL,
        period_year INTEGER NOT NULL,
        period_name TEXT NOT NULL,
        submitted_by TEXT NOT NULL,
        submitted_at DATETIME,
        status TEXT CHECK(status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED')) DEFAULT 'DRAFT',
        total_gross REAL NOT NULL DEFAULT 0,
        total_deductions REAL NOT NULL DEFAULT 0,
        total_net REAL NOT NULL DEFAULT 0,
        notes TEXT,
        rejection_reason TEXT,
        details_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_handovers (
        id TEXT PRIMARY KEY,
        resigning_username TEXT NOT NULL,
        successor_username TEXT NOT NULL,
        target_last_date TEXT NOT NULL,
        status TEXT CHECK(status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')) DEFAULT 'PENDING',
        handover_notes TEXT,
        checklist_json TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resigning_username) REFERENCES users(username),
        FOREIGN KEY (successor_username) REFERENCES users(username)
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_leaves (
        id TEXT PRIMARY KEY,
        employee_username TEXT NOT NULL,
        leave_type TEXT NOT NULL, -- SICK, ANNUAL, MATERNITY, UNPAID
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        reason TEXT,
        status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
        approved_by TEXT,
        manager_note TEXT,
        updated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_username) REFERENCES users(username),
        FOREIGN KEY (approved_by) REFERENCES users(username)
      );
    `,
    ).run();

    safeExec(db, "ALTER TABLE hr_leaves ADD COLUMN manager_note TEXT;");
    safeExec(db, "ALTER TABLE hr_leaves ADD COLUMN updated_at DATETIME;");

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_salaries (
        employee_username TEXT PRIMARY KEY,
        basic_salary REAL DEFAULT 0,
        allowances REAL DEFAULT 0,
        deductions REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_username) REFERENCES users(username) ON DELETE CASCADE
      );
    `,
    ).run();

    safeExec(db, "ALTER TABLE hr_salaries ADD COLUMN ptkp_status TEXT DEFAULT 'TK/0';");
    safeExec(db, "ALTER TABLE hr_salaries ADD COLUMN bpjs_kesehatan_active INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE hr_salaries ADD COLUMN bpjs_tk_active INTEGER DEFAULT 1;");

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_payslips (
        id TEXT PRIMARY KEY,
        employee_username TEXT NOT NULL,
        period_month TEXT NOT NULL, -- YYYY-MM
        basic_salary REAL DEFAULT 0,
        allowances REAL DEFAULT 0,
        deductions REAL DEFAULT 0,
        net_salary REAL DEFAULT 0,
        status TEXT CHECK(status IN ('DRAFT', 'PUBLISHED', 'PAID')) DEFAULT 'DRAFT',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_username) REFERENCES users(username)
      );
    `,
    ).run();
    safeExec(db, "ALTER TABLE payroll_requisitions ADD COLUMN period_key TEXT;");
    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN period_key TEXT;");
    safeExec(db, "ALTER TABLE hr_payslips ADD COLUMN period_key TEXT;");
}
