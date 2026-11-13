import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { safeExec, runAllMigrations, runPostTableMigrations } from "./migrations/runner.ts";
import { initAttendanceDb } from "./migrations/06_hris.ts";

// Tentukan direktori penyimpanan lokal untuk database (agar data aman dari script/kode)
const dbDirectory = process.env.DB_DIR || path.join(process.cwd(), "data");
const dbPath = process.env.DB_PATH || path.join(dbDirectory, "erp.db");
const attendanceDbPath = path.join(dbDirectory, "hr_attendance.db");

// Pastikan folder penyimpanan lokal sudah dibuat
if (!fs.existsSync(dbDirectory)) {
  fs.mkdirSync(dbDirectory, { recursive: true });
}

console.log(
  `[Database] Menyimpan data di lokal disk pada direktori: ${path.resolve(dbPath)}`,
);
const db = new Database(dbPath, { timeout: 15000 });

// Enable WAL mode & high-concurrency performance tuning for multi-user production
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 20000"); // 20s lock wait to prevent busy exceptions
db.pragma("cache_size = -64000"); // 64MB memory cache for fast indexing
db.pragma("temp_store = MEMORY"); // In-memory temp tables for fast joins & subqueries
db.pragma("mmap_size = 268435456"); // 256MB memory map I/O for lightning reads

// Initialize standalone HR Attendance Database (Sharding for high concurrency writes)
initAttendanceDb(attendanceDbPath);

// Attach the attendance shard to the main connection so cross-joins (e.g., users) still work elegantly
db.exec(`ATTACH DATABASE '${attendanceDbPath}' AS attendance_db;`);

// Initialize Core Tables & Modular Domain Migrations
export function initDb() {
  // Temporarily disable foreign keys and CDC triggers during schema migration & baseline seeding
  db.pragma("foreign_keys = OFF");
  setCdcTriggerSuppression(true, db);

  // Performance and Safety Pragmas
  db.pragma("synchronous = NORMAL");
  db.pragma("temp_store = MEMORY");
  db.pragma("cache_size = -64000"); // 64 MB of page cache

  try {
    db.transaction(() => {
      // Run sequential domain migrations (01 Core -> 02 CRM/Sales/Shop -> 03 Inventory/SCM -> 04 Production/MES -> 05 Finance -> 06 HRIS/HCM)
      runAllMigrations(db);

      // Seed master baseline data
      seedMasterBaseline(db);
    })();
  } finally {
    // Re-enable foreign keys and CDC triggers
    setCdcTriggerSuppression(false, db);
    db.pragma("foreign_keys = ON");
  }
}

// Master Baseline Data Seeding - Guaranteed for both Initial Setup and Virgin State Factory Reset
export function seedMasterBaseline(targetDb: any = db) {
  try {
    // 1. Exactly 3 Core Baseline Enterprise Users (Eghy, Ludy, System Admin) - 100% Bcrypt Hashes Only
    const baselineExecs = [
      {
        id: "MASTER-1",
        username: "Eghy",
        hash: "$2b$10$XtObrJZWddCJkEUs9rI8EObsbDLSlQLT7rXREv7SR9Js0gmLFadtK",
        role: "FC",
        level: "MANAGER",
        name: "Eghy Al Vandi",
      },
      {
        id: "MASTER-2",
        username: "Ludy",
        hash: "$2b$10$0gx7pqwKnm.JRJ8nT70k6u3VFGTanqt2gxc1S4OBhhZ.a.Ru3N.TO",
        role: "FC",
        level: "MANAGER",
        name: "Bachtiar Ludy",
      },
      {
        id: "USR-ADMIN",
        username: "admin",
        hash: "$2b$10$KbOKkHur8AGjc.Gy1dYkROOC4XsHt6GNVSDtFFIlCYygjxEXwmmAu",
        role: "FC",
        level: "MANAGER",
        name: "System Administrator",
      },
    ];

    const userStmt = targetDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, password, role, level, name, status, is_approved)
      VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1)
    `);
    const enforceBcryptStmt = targetDb.prepare(`
      UPDATE users
      SET password = ?
      WHERE LOWER(TRIM(username)) = LOWER(?)
        AND (password IS NULL OR (password NOT LIKE '$2b$%' AND password NOT LIKE '$2a$%' AND password NOT LIKE '$2y$%'))
    `);

    for (const exec of baselineExecs) {
      userStmt.run(exec.id, exec.username, exec.hash, exec.role, exec.level, exec.name);
      enforceBcryptStmt.run(exec.hash, exec.username);
    }

    // 2. Ensure non-project internal categories exist and are categorized as internal overhead
    const internalProjects = ['CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL'];
    for (const ipId of internalProjects) {
      targetDb.prepare(`
        INSERT OR IGNORE INTO projects (id, name, due_date, customer, status, archived_at)
        VALUES (?, ?, '2099-12-31', 'Internal Factory', 'INTERNAL_OVERHEAD', CURRENT_TIMESTAMP)
      `).run(ipId, `${ipId} Overhead & Administrative`);
    }

    targetDb.prepare(`
      UPDATE projects
      SET status = 'INTERNAL_OVERHEAD',
          archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)
      WHERE id IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
    `).run();

    // 3. Default Work Centers
    const defaultWorkCenters = [
      { id: 'WC-CUT', name: 'Cutting & Material Prep', code: 'WC-CUT', manpower: 2, hours: 8, days: 5, capacity: 80 },
      { id: 'WC-FAB', name: 'Fabrication & Welding', code: 'WC-FAB', manpower: 4, hours: 8, days: 5, capacity: 160 },
      { id: 'WC-FIN', name: 'Surface Finishing & Coating', code: 'WC-FIN', manpower: 2, hours: 8, days: 5, capacity: 80 },
      { id: 'WC-ASSY', name: 'Final Assembly & Fitting', code: 'WC-ASSY', manpower: 3, hours: 8, days: 5, capacity: 120 },
      { id: 'WC-QC', name: 'Quality Control & Inspection', code: 'WC-QC', manpower: 1, hours: 8, days: 5, capacity: 40 },
    ];
    for (const wc of defaultWorkCenters) {
      targetDb.prepare(`
        INSERT OR IGNORE INTO work_centers (id, name, code, manpower_count, hours_per_day, days_per_week, capacity_per_week, efficiency_index, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, 'ACTIVE')
      `).run(wc.id, wc.name, wc.code, wc.manpower, wc.hours, wc.days, wc.capacity);
    }

    // 4. Clean up unused auto-seeded default project stations so projects start from 0 stations
    try {
      targetDb.prepare(`
        DELETE FROM project_stations
        WHERE station_code IN ('STN-01', 'STN-02', 'STN-03')
          AND station_name IN (
            'Station 1: Fabrication & Cutting',
            'Station 2: Sub-Assembly & Welding',
            'Station 3: Finishing & Final QC'
          )
          AND id NOT IN (
            SELECT DISTINCT station_id FROM bill_of_processes WHERE station_id IS NOT NULL AND station_id != ''
          )
          AND station_code NOT IN (
            SELECT DISTINCT station_id FROM bill_of_processes WHERE station_id IS NOT NULL AND station_id != ''
          )
      `).run();
    } catch (e) {}

    // Clean up any default machine seeds to keep inventory clean
    targetDb.prepare(`
      DELETE FROM items 
      WHERE id IN ('MCH-CNC-01', 'MCH-FIT-01', 'MCH-WLD-01', 'MCH-WLD-02', 'MCH-BLS-01', 'MCH-ASY-01', 'MCH-QCI-01')
         OR (type = 'MACHINE' AND item_code IN ('CNC-01', 'FIT-01', 'WLD-01', 'WLD-02', 'BLS-01', 'ASY-01', 'QCI-01'))
    `).run();
    targetDb.prepare(`
      DELETE FROM inventory 
      WHERE item_id IN ('MCH-CNC-01', 'MCH-FIT-01', 'MCH-WLD-01', 'MCH-WLD-02', 'MCH-BLS-01', 'MCH-ASY-01', 'MCH-QCI-01')
    `).run();

    // 5. Standard Chart of Accounts (COA) for Enterprise Double-Entry
    const standardAccounts = [
      { code: "1101", name: "Kas & Rekening Bank (Cash & Bank)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Kas operasional dan saldo bank perusahaan" },
      { code: "1102", name: "Piutang Usaha (Accounts Receivable)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Tagihan pelanggan atas penjualan kredit" },
      { code: "1103", name: "Persediaan Barang Jadi (Finished Goods)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Stok produk siap jual" },
      { code: "1104", name: "Persediaan Bahan Baku (Raw Materials)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Stok material fabrikasi dan produksi" },
      { code: "1105", name: "Pekerjaan Dalam Proses (WIP Inventory)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Barang setengah jadi dalam lini produksi" },
      { code: "1106", name: "PPN Masukan (Prepaid VAT / Input VAT)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Pajak masukan atas pembelian material" },
      { code: "1107", name: "Pajak Dibayar Dimuka PPh 23 (Prepaid WHT)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Kredit pajak PPh 23 yang dipotong pelanggan" },
      { code: "1108", name: "Kas & Bank Penerimaan Storefront B2C", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Rekening penampungan pembayaran ritel storefront & QRIS" },
      { code: "2101", name: "Hutang Usaha (Accounts Payable)", category: "LIABILITY", type: "CURRENT", normal: "CREDIT", desc: "Kewajiban pembayaran kepada vendor supplier" },
      { code: "2102", name: "PPN Keluaran (VAT Payable / Output VAT)", category: "LIABILITY", type: "CURRENT", normal: "CREDIT", desc: "Pajak keluaran atas faktur komersial penjualan" },
      { code: "2103", name: "Hutang BPJS Ketenagakerjaan & Kesehatan", category: "LIABILITY", type: "CURRENT", normal: "CREDIT", desc: "Titipan iuran BPJS karyawan" },
      { code: "2104", name: "Hutang PPh 21 / PPh 23 (Withholding Tax)", category: "LIABILITY", type: "CURRENT", normal: "CREDIT", desc: "Potongan pajak penghasilan yang belum disetor" },
      { code: "2105", name: "Akrual Penerimaan Barang Belum Difakturkan (GRNI)", category: "LIABILITY", type: "CURRENT", normal: "CREDIT", desc: "Kewajiban akrual atas penerimaan fisik barang GRN" },
      { code: "2106", name: "Uang Muka Pelanggan (Customer Deposits / Unearned Revenue)", category: "LIABILITY", type: "CURRENT", normal: "CREDIT", desc: "Kewajiban atas penerimaan Faktur DP sebelum pengiriman lunas" },
      { code: "3101", name: "Modal Disetor (Paid-in Capital)", category: "EQUITY", type: "EQUITY", normal: "CREDIT", desc: "Ekuitas modal pemilik" },
      { code: "3102", name: "Laba Ditahan (Retained Earnings)", category: "EQUITY", type: "EQUITY", normal: "CREDIT", desc: "Akumulasi saldo laba bersih periode lampau" },
      { code: "4101", name: "Pendapatan Usaha (Sales Revenue)", category: "REVENUE", type: "OPERATING", normal: "CREDIT", desc: "Omset penjualan produk dan jasa fabrikasi" },
      { code: "5101", name: "Beban Pokok Penjualan Material (COGS Material)", category: "EXPENSE", type: "DIRECT_COST", normal: "DEBIT", desc: "HPP pemakaian bahan baku langsung" },
      { code: "5102", name: "Beban Tenaga Kerja Langsung (Direct Labor)", category: "EXPENSE", type: "DIRECT_COST", normal: "DEBIT", desc: "Upah operator produksi pabrik" },
      { code: "6101", name: "Beban Gaji & Upah Kantor (Opex Salaries)", category: "EXPENSE", type: "OPERATING", normal: "DEBIT", desc: "Beban gaji staf manajemen dan administrasi" },
      { code: "6102", name: "Beban Operasional & Umum (General & Admin)", category: "EXPENSE", type: "OPERATING", normal: "DEBIT", desc: "Listrik, air, sewa, internet, dan operasional kantor" },
      { code: "6103", name: "Beban Logistik & Pengiriman (Freight Out)", category: "EXPENSE", type: "OPERATING", normal: "DEBIT", desc: "Beban armada, BBM, dan distribusi" },
    ];

    const insertCoa = targetDb.prepare(`
      INSERT OR IGNORE INTO chart_of_accounts (id, code, name, category, type, normal_balance, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const a of standardAccounts) {
      insertCoa.run(`COA-${a.code}`, a.code, a.name, a.category, a.type, a.normal, a.desc);
    }

    // 6. Default Accounting Period
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");
    const currentPeriodKey = `${currentYear}-${currentMonth}`;
    const periodExists = targetDb.prepare("SELECT id FROM accounting_periods WHERE period_key = ?").get(currentPeriodKey);
    if (!periodExists) {
      const lastDay = new Date(currentYear, new Date().getMonth() + 1, 0).getDate();
      targetDb.prepare(`
        INSERT OR IGNORE INTO accounting_periods (id, period_key, period_name, start_date, end_date, status, notes)
        VALUES (?, ?, ?, ?, ?, 'OPEN', 'Default active financial period')
      `).run(
        `PER-${currentPeriodKey}`,
        currentPeriodKey,
        `Periode ${currentMonth}/${currentYear}`,
        `${currentYear}-${currentMonth}-01`,
        `${currentYear}-${currentMonth}-${lastDay}`
      );
    }

    // 7. System Settings
    targetDb.prepare(`
      INSERT OR IGNORE INTO system_settings (key, value)
      VALUES ('heijunka_threshold', '0.85'), ('default_tax_rate', '11'), ('default_tax_scheme', 'DPP_NILAI_LAIN'), ('currency', 'IDR')
    `).run();

    // 8. Data Remediation: Purge Back-Office ERP/HRIS users from production_manpower
    // Only dedicated Shop-Floor Operators (role = 'OPERATOR') belong in production_manpower.
    try {
      const nonOperatorManpower = targetDb.prepare(`
        SELECT mp.id, mp.user_username, mp.name, u.role
        FROM production_manpower mp
        INNER JOIN users u ON LOWER(TRIM(mp.user_username)) = LOWER(TRIM(u.username))
        WHERE UPPER(COALESCE(u.role, '')) != 'OPERATOR'
      `).all() as Array<{ id: string; user_username: string; name: string; role: string }>;

      if (nonOperatorManpower.length > 0) {
        for (const badMp of nonOperatorManpower) {
          targetDb.prepare(`DELETE FROM production_manpower_assignments WHERE manpower_id = ?`).run(badMp.id);
          targetDb.prepare(`DELETE FROM production_manpower WHERE id = ?`).run(badMp.id);
          targetDb.prepare(`
            UPDATE items
            SET assigned_operator = NULL
            WHERE LOWER(TRIM(COALESCE(assigned_operator, ''))) IN (LOWER(TRIM(?)), LOWER(TRIM(?)))
          `).run(badMp.user_username || "", badMp.name || "");
        }
        console.log(
          `[Database] Cleaned ${nonOperatorManpower.length} Back-Office ERP user(s) from production_manpower: ${nonOperatorManpower.map((m) => m.user_username).join(", ")}`,
        );
      }

      // Ensure standard Shop-Floor Operators exist in production_manpower & users (role = 'OPERATOR')
      // Password hash below is bcrypt for 'paving123'
      const defaultOperatorHash = "$2b$10$KbOKkHur8AGjc.Gy1dYkROOC4XsHt6GNVSDtFFIlCYygjxEXwmmAu";
      const defaultShopFloorOperators = [
        {
          id: "mp-001",
          user_id: "USR-OP-001",
          user_username: "bambang_cnc",
          nik: "MP-2024-001",
          name: "Bambang Sudirman",
          role_title: "Senior CNC Machinist & Programmer",
          skill_level: "MASTER",
          specialization: "Machining (CNC / Milling)",
          shift: "SHIFT_1",
          status: "ON_DUTY",
          phone: "+62 812-3456-7801",
          email: "bambang.cnc@factory.local",
          hourly_rate: 65000,
          basic_salary: 6500000,
          work_center_id: "WC-CUT",
          certifications: JSON.stringify(["Fanuc 5-Axis Certified", "ISO 9001:2015 Machining"]),
          active_task_name: "CNC Milling Impeller Shaft Housing",
          total_hours_worked: 320.5,
          completed_tasks_count: 48,
          efficiency_rating: 98.4,
          notes: "Lead machinist for high-precision components and turbine casings.",
        },
        {
          id: "mp-002",
          user_id: "USR-OP-002",
          user_username: "agus_welder",
          nik: "MP-2024-002",
          name: "Agus Pratama",
          role_title: "Certified ASME TIG/MIG Welder",
          skill_level: "SENIOR",
          specialization: "Welding & Fabrication",
          shift: "SHIFT_1",
          status: "AVAILABLE",
          phone: "+62 813-9876-5402",
          email: "agus.welder@factory.local",
          hourly_rate: 55000,
          basic_salary: 5800000,
          work_center_id: "WC-FAB",
          certifications: JSON.stringify(["ASME Section IX 6G 6GR", "MIG/MAG Heavy Structure"]),
          active_task_name: null,
          total_hours_worked: 245.0,
          completed_tasks_count: 36,
          efficiency_rating: 96.2,
          notes: "Expert in stainless steel piping and pressure vessel welding.",
        },
        {
          id: "mp-003",
          user_id: "USR-OP-003",
          user_username: "dedi_fitter",
          nik: "MP-2024-003",
          name: "Dedi Supriyanto",
          role_title: "Mechanical Assembly Technician",
          skill_level: "SENIOR",
          specialization: "Assembly & Fitting",
          shift: "SHIFT_2",
          status: "ON_DUTY",
          phone: "+62 818-1234-5603",
          email: "dedi.assembly@factory.local",
          hourly_rate: 48000,
          basic_salary: 5200000,
          work_center_id: "WC-ASSY",
          certifications: JSON.stringify(["Hydraulic Systems Specialist", "Torque Tightening QA"]),
          active_task_name: "Hydraulic Pump Sub-assembly & Torque Alignment",
          total_hours_worked: 210.0,
          completed_tasks_count: 29,
          efficiency_rating: 94.8,
          notes: "Precision gearbox alignment and bearing press-fitting specialist.",
        },
        {
          id: "mp-004",
          user_id: "USR-OP-004",
          user_username: "rian_qc",
          nik: "MP-2024-004",
          name: "Rian Hidayat",
          role_title: "Quality Control & NDT Inspector",
          skill_level: "SENIOR",
          specialization: "Quality Control",
          shift: "SHIFT_1",
          status: "AVAILABLE",
          phone: "+62 819-5566-7704",
          email: "rian.qc@factory.local",
          hourly_rate: 52000,
          basic_salary: 5400000,
          work_center_id: "WC-QC",
          certifications: JSON.stringify(["NDT Ultrasonic Testing Level II", "CMM Mitutoyo Operator"]),
          active_task_name: null,
          total_hours_worked: 180.0,
          completed_tasks_count: 52,
          efficiency_rating: 99.1,
          notes: "Authorized final dimensional report and CMM coordinate verifier.",
        },
        {
          id: "mp-005",
          user_id: "USR-OP-005",
          user_username: "hendra_finishing",
          nik: "MP-2024-005",
          name: "Hendra Wijaya",
          role_title: "Surface Finishing & Epoxy Specialist",
          skill_level: "JUNIOR",
          specialization: "Finishing & Coating",
          shift: "SHIFT_2",
          status: "AVAILABLE",
          phone: "+62 811-9988-3305",
          email: "hendra.finishing@factory.local",
          hourly_rate: 42000,
          basic_salary: 4800000,
          work_center_id: "WC-FIN",
          certifications: JSON.stringify(["Sandblasting Safety SA 2.5", "High-Solid Polyurethane Painting"]),
          active_task_name: null,
          total_hours_worked: 140.0,
          completed_tasks_count: 18,
          efficiency_rating: 91.5,
          notes: "Expert in heavy duty marine-grade blasting and primer spray.",
        },
        {
          id: "mp-006",
          user_id: "USR-OP-006",
          user_username: "fajar_electric",
          nik: "MP-2024-006",
          name: "Fajar Nugroho",
          role_title: "Electrical & Control Wiring Tech",
          skill_level: "SENIOR",
          specialization: "Electrical & Wiring",
          shift: "GENERAL",
          status: "ON_DUTY",
          phone: "+62 812-7711-4406",
          email: "fajar.electric@factory.local",
          hourly_rate: 58000,
          basic_salary: 5900000,
          work_center_id: "WC-ASSY",
          certifications: JSON.stringify(["PLC Schneider Wiring", "K3 Listrik Kemnaker RI"]),
          active_task_name: "Control Panel Terminal Termination & Wire Harnessing",
          total_hours_worked: 310.0,
          completed_tasks_count: 41,
          efficiency_rating: 97.0,
          notes: "Control panel layout wiring and PLC I/O loop verification.",
        },
        {
          id: "mp-007",
          user_id: "USR-OP-007",
          user_username: "wahyu_lathe",
          nik: "MP-2024-007",
          name: "Wahyu Setiawan",
          role_title: "Junior CNC Lathe Operator",
          skill_level: "JUNIOR",
          specialization: "Machining (CNC / Milling)",
          shift: "SHIFT_3",
          status: "AVAILABLE",
          phone: "+62 856-1122-3307",
          email: "wahyu.s@factory.local",
          hourly_rate: 38000,
          basic_salary: 4600000,
          work_center_id: "WC-CUT",
          certifications: JSON.stringify(["Basic G-Code Machining", "Tool Offset Calibration"]),
          active_task_name: null,
          total_hours_worked: 95.0,
          completed_tasks_count: 14,
          efficiency_rating: 89.2,
          notes: "Third shift CNC night turning operator under supervision.",
        },
        {
          id: "mp-008",
          user_id: "USR-OP-008",
          user_username: "tri_toolmaker",
          nik: "MP-2024-008",
          name: "Tri Wibowo",
          role_title: "Tool & Die Maker",
          skill_level: "MASTER",
          specialization: "Machining (CNC / Milling)",
          shift: "SHIFT_1",
          status: "ON_LEAVE",
          phone: "+62 813-2233-4408",
          email: "tri.wibowo@factory.local",
          hourly_rate: 62000,
          basic_salary: 6200000,
          work_center_id: "WC-CUT",
          certifications: JSON.stringify(["Progressive Die Design", "Jig & Fixture Prototyping"]),
          active_task_name: null,
          total_hours_worked: 410.0,
          completed_tasks_count: 65,
          efficiency_rating: 98.9,
          notes: "Jig & fixture fabrication expert with 15+ years experience.",
        },
      ];

      const validMpCount = (
        targetDb.prepare(`SELECT COUNT(*) as cnt FROM production_manpower WHERE archived_at IS NULL`).get() as any
      )?.cnt || 0;

      const insertOpMpStmt = targetDb.prepare(`
        INSERT OR IGNORE INTO production_manpower (
          id, user_username, nik, name, role_title, skill_level, specialization, shift, status,
          phone, email, hourly_rate, certifications, active_project_id, active_task_name,
          total_hours_worked, completed_tasks_count, efficiency_rating, notes, work_center_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
      `);

      const insertOpUserStmt = targetDb.prepare(`
        INSERT OR IGNORE INTO users (
          id, username, password, role, level, name, status, is_approved,
          employee_no, contract_type, ptkp_status, work_center_id
        ) VALUES (?, ?, ?, 'OPERATOR', 'STAFF', ?, 'APPROVED', 1, ?, 'PKWT', 'TK/0', ?)
      `);

      const insertOpSalStmt = targetDb.prepare(`
        INSERT OR IGNORE INTO hr_salaries (
          employee_username, basic_salary, allowances, deductions, ptkp_status, bpjs_kesehatan_active, bpjs_tk_active
        ) VALUES (?, ?, 450000, 0, 'TK/0', 1, 1)
      `);

      for (const op of defaultShopFloorOperators) {
        if (validMpCount === 0) {
          insertOpMpStmt.run(
            op.id,
            op.user_username,
            op.nik,
            op.name,
            op.role_title,
            op.skill_level,
            op.specialization,
            op.shift,
            op.status,
            op.phone,
            op.email,
            op.hourly_rate,
            op.certifications,
            op.active_task_name,
            op.total_hours_worked,
            op.completed_tasks_count,
            op.efficiency_rating,
            op.notes,
            op.work_center_id,
          );
        }
        insertOpUserStmt.run(
          op.user_id,
          op.user_username,
          defaultOperatorHash,
          op.name,
          op.nik,
          op.work_center_id,
        );
        insertOpSalStmt.run(op.user_username, op.basic_salary);
        targetDb.prepare(
          `INSERT OR IGNORE INTO chat_participants (thread_id, username) VALUES ('THREAD-GENERAL', ?)`,
        ).run(op.user_username);
      }
    } catch (cleanErr) {
      console.warn("[Database] Operator remediation notice:", cleanErr);
    }

  } catch (e) {
    console.error("[MASTER BASELINE SEED ERROR]", e);
  }
}

// Factory Reset Helper - Complete Virgin State
export function resetFactoryData() {
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      const safeResetRun = (sql: string) => {
        try {
          db.prepare(sql).run();
        } catch (e: any) {}
      };

      // 1. Clear Shop & E-Commerce Data
      safeResetRun("DELETE FROM shop_orders");
      safeResetRun("DELETE FROM shop_order_items");
      safeResetRun("DELETE FROM potential_customers");
      safeResetRun("DELETE FROM visitor_activities");
      safeResetRun("DELETE FROM customer_consents");
      safeResetRun("DELETE FROM erasure_requests");
      safeResetRun("DELETE FROM scout_jobs");

      // 2. Clear CRM, Sales, Deliveries & Billing Data
      safeResetRun("DELETE FROM crm_leads");
      safeResetRun("DELETE FROM ntps");
      safeResetRun("DELETE FROM spks");
      safeResetRun("DELETE FROM quotation_items");
      safeResetRun("DELETE FROM quotations");
      safeResetRun("DELETE FROM commercial_invoices");
      safeResetRun("DELETE FROM finance_transactions");
      safeResetRun("DELETE FROM dn_signatures");
      safeResetRun("DELETE FROM delivery_items");
      safeResetRun("DELETE FROM delivery_notes");
      safeResetRun("DELETE FROM customers");
      safeResetRun("DELETE FROM outreach_activities");

      // 3. Clear Procurement, Production, Genealogy & Movements
      safeResetRun("DELETE FROM journal_entries");
      safeResetRun("DELETE FROM journal_entry_lines");
      safeResetRun("DELETE FROM work_center_routings");
      safeResetRun("DELETE FROM bop_versions");
      safeResetRun("DELETE FROM bill_of_processes");
      safeResetRun("DELETE FROM product_node_lifecycle");
      safeResetRun("DELETE FROM notice_to_down_processes");
      safeResetRun("DELETE FROM ndps");
      safeResetRun("DELETE FROM task_travel_tags");
      safeResetRun("DELETE FROM finish_good_records");
      safeResetRun("DELETE FROM wip_movements");
      safeResetRun("DELETE FROM inventory_reservations");
      safeResetRun("DELETE FROM delivery_receipts");
      safeResetRun("DELETE FROM delivery_receipt_items");
      safeResetRun("DELETE FROM workflow_audit_logs");
      safeResetRun("DELETE FROM production_manpower");
      safeResetRun("DELETE FROM project_stations");
      safeResetRun("DELETE FROM production_manpower_assignments");
      safeResetRun("DELETE FROM eco_logs");
      safeResetRun("DELETE FROM production_lots");
      safeResetRun("DELETE FROM lot_routing_executions");
      safeResetRun("DELETE FROM unit_process_progress");
      safeResetRun("DELETE FROM project_financial_summaries");
      safeResetRun("DELETE FROM finance_monthly_summaries");
      safeResetRun("DELETE FROM finance_global_summary");
      safeResetRun("DELETE FROM stock_movements");
      safeResetRun("DELETE FROM grn_items");
      safeResetRun("DELETE FROM grns");
      safeResetRun("DELETE FROM procurement_plan_items");
      safeResetRun("DELETE FROM procurement_plan_waves");
      safeResetRun("DELETE FROM procurement_plans");
      safeResetRun("DELETE FROM pr_items");
      safeResetRun("DELETE FROM purchase_orders");
      safeResetRun("DELETE FROM purchase_requests");
      safeResetRun("DELETE FROM suppliers");
      safeResetRun("DELETE FROM work_order_tickets");
      safeResetRun("DELETE FROM work_order_items");
      safeResetRun("DELETE FROM work_orders");
      safeResetRun("DELETE FROM bom_item_consumption");
      safeResetRun("DELETE FROM boms");
      safeResetRun("DELETE FROM production_wot_genealogy");
      safeResetRun("DELETE FROM wot_history");
      safeResetRun("DELETE FROM wot_travel_logs");
      safeResetRun("DELETE FROM floor_requests");
      safeResetRun("DELETE FROM machine_schedules");
      safeResetRun("DELETE FROM material_requests");
      safeResetRun("DELETE FROM material_dispatches");
      safeResetRun("DELETE FROM project_manpower");

      // 4. Clear Projects & Tasks
      safeResetRun("DELETE FROM project_tasks");
      safeResetRun("DELETE FROM project_overtime_schedules");
      safeResetRun("DELETE FROM projects WHERE id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')");

      // 5. Clear Inventory Items, Supplier Pricing & BOM Templates
      safeResetRun("DELETE FROM item_supplier_prices");
      safeResetRun("DELETE FROM item_price_history");
      safeResetRun("DELETE FROM inventory_labels");
      safeResetRun("DELETE FROM bom_template_items");
      safeResetRun("DELETE FROM bom_templates");
      safeResetRun("DELETE FROM inventory");
      safeResetRun("DELETE FROM items");

      // 6. Clear HRIS & Personnel Data (Retain exactly 3 Core Baseline Users: Eghy, Ludy, and admin)
      safeResetRun("DELETE FROM users WHERE username NOT IN ('Eghy', 'Ludy', 'admin')");
      safeResetRun("DELETE FROM hr_jobs");
      safeResetRun("DELETE FROM hr_applications");
      safeResetRun("DELETE FROM hr_kpis");
      safeResetRun("DELETE FROM finance_payroll");
      safeResetRun("DELETE FROM payroll_requisitions");
      safeResetRun("DELETE FROM hr_handovers");
      safeResetRun("DELETE FROM hr_leaves");
      safeResetRun("DELETE FROM hr_payslips");
      safeResetRun("DELETE FROM hr_salaries");

      // 7. Clear Social/Chat/Forum/Audit
      safeResetRun("DELETE FROM chat_messages");
      safeResetRun("DELETE FROM chat_participants WHERE thread_id != 'THREAD-GENERAL'");
      safeResetRun("DELETE FROM chat_threads WHERE id != 'THREAD-GENERAL'");
      safeResetRun("DELETE FROM forum_comments");
      safeResetRun("DELETE FROM forum_posts");
      safeResetRun("DELETE FROM user_drafts");
      safeResetRun("DELETE FROM audit_trail");
      safeResetRun("DELETE FROM ai_feedback");

      // 8. Re-seed & Guarantee Master Baseline Operational Data (Exactly 3 users, COA, settings)
      seedMasterBaseline(db);

      console.log("[Database] Virgin state factory reset executed successfully with baseline master intact.");
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

export function resetHrData() {
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      const safeResetRun = (sql: string) => {
        try {
          db.prepare(sql).run();
        } catch (e: any) {}
      };

      // Clear HRIS and Human Resource Data
      safeResetRun("DELETE FROM attendance_db.hr_attendances");
      safeResetRun("DELETE FROM hr_jobs");
      safeResetRun("DELETE FROM hr_applications");
      safeResetRun("DELETE FROM hr_kpis");
      safeResetRun("DELETE FROM finance_payroll");
      safeResetRun("DELETE FROM payroll_requisitions");
      safeResetRun("DELETE FROM finance_transactions WHERE category = 'PAYROLL'");
      safeResetRun("DELETE FROM audit_trail WHERE action LIKE '%HR%' OR action LIKE '%PAYROLL%'");
      safeResetRun("DELETE FROM hr_handovers");
      safeResetRun("DELETE FROM hr_leaves");
      safeResetRun("DELETE FROM hr_payslips");
      safeResetRun("DELETE FROM hr_salaries");
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

let writeThroughWakeHandler: (() => void) | null = null;
let installedCdcTriggerTablesCount = 0;

export function registerWriteThroughWakeHandler(handler: () => void) {
  writeThroughWakeHandler = handler;
}

try {
  db.function("cdc_wake_worker", () => {
    if (writeThroughWakeHandler) {
      try {
        writeThroughWakeHandler();
      } catch {
        // non-blocking
      }
    }
    return 1;
  });
} catch {
  // function already registered
}

const CDC_EXCLUDED_TABLES = new Set([
  "sqlite_sequence",
  "sqlite_stat1",
  "_hybrid_sync_control",
  "outbox_events",
  "idempotency_keys",
  "visitor_activities",
  "erp_pitr_backups",
  "user_drafts",
]);

export function setCdcTriggerSuppression(suppressed: boolean, targetDb: any = db) {
  try {
    targetDb
      .prepare(
        `INSERT INTO _hybrid_sync_control (key, value) VALUES ('suppress_triggers', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(suppressed ? "1" : "0");
  } catch {
    // ignore if control table not yet initialized
  }
}

export function getHybridSyncWatermark(targetDb: any = db): string | null {
  try {
    const row = targetDb
      .prepare(
        `SELECT value FROM _hybrid_sync_control WHERE key = 'last_delta_watermark'`,
      )
      .get() as { value?: string } | undefined;
    return row?.value || null;
  } catch {
    return null;
  }
}

export function setHybridSyncWatermark(isoTimestamp: string, targetDb: any = db) {
  try {
    targetDb
      .prepare(
        `INSERT INTO _hybrid_sync_control (key, value) VALUES ('last_delta_watermark', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(isoTimestamp);
  } catch {
    // ignore
  }
}

/**
 * Installs automatic SQLite WAL Change Data Capture (CDC) triggers across all ERP tables.
 * Every INSERT, UPDATE, and DELETE on any ERP table automatically writes to `outbox_events`
 * and wakes the immediate Write-Through worker to commit to PostgreSQL Primary SSOT.
 */
export function installHybridCdcTriggers(targetDb: any = db): number {
  let hookedTables = 0;
  try {
    targetDb.exec(`
      CREATE TABLE IF NOT EXISTS _hybrid_sync_control (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT OR IGNORE INTO _hybrid_sync_control (key, value) VALUES ('suppress_triggers', '0');
    `);

    const outboxExists = targetDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='outbox_events'",
      )
      .get();
    if (!outboxExists) return 0;

    const tables = targetDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
      )
      .all() as Array<{ name: string }>;

    targetDb.transaction(() => {
      for (const { name: tableName } of tables) {
        if (CDC_EXCLUDED_TABLES.has(tableName) || !/^[a-zA-Z0-9_]+$/.test(tableName)) {
          continue;
        }

        const columns = targetDb
          .prepare(`PRAGMA table_info("${tableName}")`)
          .all() as Array<{ name: string; pk: number }>;

        if (!columns || columns.length === 0) continue;

        const pkColObj =
          columns.find((c) => c.pk === 1) ||
          columns.find((c) => c.name === "id") ||
          columns.find((c) => c.name === "key") ||
          columns.find((c) => c.name === "section_key") ||
          columns[0];

        const pkCol = pkColObj ? pkColObj.name : "rowid";
        const newPkExpr = pkCol === "rowid" ? "CAST(NEW.rowid AS TEXT)" : `CAST(COALESCE(NEW."${pkCol}", NEW.rowid) AS TEXT)`;
        const oldPkExpr = pkCol === "rowid" ? "CAST(OLD.rowid AS TEXT)" : `CAST(COALESCE(OLD."${pkCol}", OLD.rowid) AS TEXT)`;

        // Build json_object arguments (capped at 60 columns = 120 args for SQLite limits)
        const cappedCols = columns.slice(0, 60);
        const jsonArgsNew = cappedCols
          .map((c) => `'${c.name.replace(/'/g, "''")}', NEW."${c.name}"`)
          .join(", ");

        const insTrigger = `trg_cdc_ins_${tableName}`;
        const updTrigger = `trg_cdc_upd_${tableName}`;
        const delTrigger = `trg_cdc_del_${tableName}`;

        try {
          targetDb.exec(`
            DROP TRIGGER IF EXISTS "${insTrigger}";
            CREATE TRIGGER "${insTrigger}"
            AFTER INSERT ON "${tableName}"
            WHEN (SELECT value FROM _hybrid_sync_control WHERE key = 'suppress_triggers') != '1'
            BEGIN
              INSERT INTO outbox_events (
                id, aggregate_type, aggregate_id, event_type, payload_json,
                destination, status, retry_count, max_retries, created_at
              ) VALUES (
                'OBX-CDC-' || hex(randomblob(6)),
                '${tableName}',
                ${newPkExpr},
                'UPSERT',
                json_object(${jsonArgsNew}),
                'POSTGRES',
                'PENDING',
                0,
                5,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              );
              SELECT cdc_wake_worker();
            END;

            DROP TRIGGER IF EXISTS "${updTrigger}";
            CREATE TRIGGER "${updTrigger}"
            AFTER UPDATE ON "${tableName}"
            WHEN (SELECT value FROM _hybrid_sync_control WHERE key = 'suppress_triggers') != '1'
            BEGIN
              INSERT INTO outbox_events (
                id, aggregate_type, aggregate_id, event_type, payload_json,
                destination, status, retry_count, max_retries, created_at
              ) VALUES (
                'OBX-CDC-' || hex(randomblob(6)),
                '${tableName}',
                ${newPkExpr},
                'UPSERT',
                json_object(${jsonArgsNew}),
                'POSTGRES',
                'PENDING',
                0,
                5,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              );
              SELECT cdc_wake_worker();
            END;

            DROP TRIGGER IF EXISTS "${delTrigger}";
            CREATE TRIGGER "${delTrigger}"
            AFTER DELETE ON "${tableName}"
            WHEN (SELECT value FROM _hybrid_sync_control WHERE key = 'suppress_triggers') != '1'
            BEGIN
              INSERT INTO outbox_events (
                id, aggregate_type, aggregate_id, event_type, payload_json,
                destination, status, retry_count, max_retries, created_at
              ) VALUES (
                'OBX-CDC-' || hex(randomblob(6)),
                '${tableName}',
                ${oldPkExpr},
                'DELETE',
                json_object('id', ${oldPkExpr}),
                'POSTGRES',
                'PENDING',
                0,
                5,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              );
              SELECT cdc_wake_worker();
            END;
          `);
          hookedTables++;
        } catch (trigErr) {
          console.warn(`[HybridCDC] Skipped trigger on ${tableName}:`, trigErr);
        }
      }
    })();

    installedCdcTriggerTablesCount = hookedTables;
  } catch (err) {
    console.warn("[HybridCDC] Failed to install automatic SQLite CDC triggers:", err);
  }
  return hookedTables;
}

export function getSqliteWalTelemetry() {
  try {
    const journalMode = String(db.pragma("journal_mode", { simple: true }) || "wal").toUpperCase();
    const synchronousCode = Number(db.pragma("synchronous", { simple: true }) ?? 1);
    const synchronousLabel =
      synchronousCode === 0 ? "OFF" : synchronousCode === 1 ? "NORMAL" : "FULL";
    const cacheSizeRaw = Number(db.pragma("cache_size", { simple: true }) || -64000);
    const cacheSizeMb =
      cacheSizeRaw < 0
        ? Math.round(Math.abs(cacheSizeRaw) / 1024)
        : Math.round((cacheSizeRaw * 4096) / (1024 * 1024));
    const mmapSizeMb = Math.round(
      Number(db.pragma("mmap_size", { simple: true }) || 268435456) / (1024 * 1024),
    );
    const pageCount = Number(db.pragma("page_count", { simple: true }) || 0);
    const pageSize = Number(db.pragma("page_size", { simple: true }) || 4096);
    const dbSizeMb = Number(((pageCount * pageSize) / (1024 * 1024)).toFixed(2));
    const walAutocheckpoint = Number(db.pragma("wal_autocheckpoint", { simple: true }) || 1000);

    return {
      role: "SECONDARY_IN_PROCESS_CACHE",
      engine: "SQLite 3 (better-sqlite3)",
      journalMode,
      synchronous: synchronousLabel,
      cacheSizeMb,
      mmapSizeMb,
      dbSizeMb,
      pageCount,
      pageSize,
      walAutocheckpoint,
      cdcHookedTables: installedCdcTriggerTablesCount,
      cdcTriggerCount: installedCdcTriggerTablesCount * 3,
      readLatencyClass: "< 0.15ms (In-Process Memory-Mapped)",
      lastDeltaWatermark: getHybridSyncWatermark(db),
    };
  } catch {
    return {
      role: "SECONDARY_IN_PROCESS_CACHE",
      engine: "SQLite 3 (better-sqlite3)",
      journalMode: "WAL",
      synchronous: "NORMAL",
      cacheSizeMb: 64,
      mmapSizeMb: 256,
      dbSizeMb: 0,
      pageCount: 0,
      pageSize: 4096,
      walAutocheckpoint: 1000,
      cdcHookedTables: installedCdcTriggerTablesCount,
      cdcTriggerCount: installedCdcTriggerTablesCount * 3,
      readLatencyClass: "< 0.15ms (In-Process Memory-Mapped)",
      lastDeltaWatermark: null,
    };
  }
}

export function runSqliteWalCheckpoint(
  mode: "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE" = "PASSIVE",
) {
  const safeMode = ["PASSIVE", "FULL", "RESTART", "TRUNCATE"].includes(mode)
    ? mode
    : "PASSIVE";
  try {
    const res = db.pragma(`wal_checkpoint(${safeMode})`) as Array<{
      busy: number;
      log: number;
      checkpointed: number;
    }>;
    const first = res?.[0] || { busy: 0, log: 0, checkpointed: 0 };
    return {
      success: true,
      mode: safeMode,
      busy: first.busy,
      walFramesTotal: first.log,
      walFramesCheckpointed: first.checkpointed,
      telemetry: getSqliteWalTelemetry(),
    };
  } catch (err: any) {
    return {
      success: false,
      mode: safeMode,
      error: err?.message || String(err),
      telemetry: getSqliteWalTelemetry(),
    };
  }
}

// Auto-initialize schema & tables on module load
try {
  initDb();
  try {
    db.prepare("ALTER TABLE projects ADD COLUMN factory_factor REAL DEFAULT 85").run();
  } catch {
    // column might already exist
  }
  const hookedCount = installHybridCdcTriggers(db);
  setCdcTriggerSuppression(false, db);
  console.log(
    `[Database] SQLite WAL Secondary Cache initialized (${hookedCount} ERP tables hooked with automatic Write-Through CDC triggers).`,
  );
} catch (e) {
  console.error("[Database] Auto-initialize database error:", e);
}

export { db, safeExec, runPostTableMigrations };
export default db;

