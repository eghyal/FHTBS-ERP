import type Database from "better-sqlite3";
import crypto from "crypto";

export interface ClosingWindowStatus {
  is_open: boolean;
  current_day: number;
  current_date: string;
  current_period_key: string;
  default_closing_period_key: string;
  window_start_day: number;
  window_end_day: number;
  days_remaining: number;
  days_until_open: number;
  next_window_label: string;
  message: string;
}

const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/**
 * Evaluates the strict monthly book-closing schedule (15th to 24th of each month).
 * Uses Asia/Jakarta calendar day for consistency across cloud/local runtimes.
 */
export function evaluateClosingWindow(now: Date = new Date()): ClosingWindowStatus {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === "year")?.value || now.getFullYear());
  const month = Number(parts.find((p) => p.type === "month")?.value || now.getMonth() + 1);
  const day = Number(parts.find((p) => p.type === "day")?.value || now.getDate());

  const currentDateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const currentPeriodKey = `${year}-${String(month).padStart(2, "0")}`;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const defaultClosingPeriodKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  const isOpen = day >= 15 && day <= 24;

  let daysUntilOpen = 0;
  let nextWindowMonth = month;
  let nextWindowYear = year;
  if (day < 15) {
    daysUntilOpen = 15 - day;
  } else if (day > 24) {
    const daysInMonth = new Date(year, month, 0).getDate();
    daysUntilOpen = daysInMonth - day + 15;
    nextWindowMonth = month === 12 ? 1 : month + 1;
    nextWindowYear = month === 12 ? year + 1 : year;
  }

  const nextMonthName = SHORT_MONTHS[nextWindowMonth - 1] || String(nextWindowMonth);
  const nextWindowLabel = `15–24 ${nextMonthName} ${nextWindowYear}`;
  const daysRemaining = isOpen ? 24 - day + 1 : 0;

  const message = isOpen
    ? `Active · Day ${day} (${daysRemaining}d remaining)`
    : day < 15
      ? `Locked · Opens in ${daysUntilOpen}d (${nextWindowLabel})`
      : `Window closed · Next: ${nextWindowLabel}`;

  return {
    is_open: isOpen,
    current_day: day,
    current_date: currentDateStr,
    current_period_key: currentPeriodKey,
    default_closing_period_key: defaultClosingPeriodKey,
    window_start_day: 15,
    window_end_day: 24,
    days_remaining: daysRemaining,
    days_until_open: daysUntilOpen,
    next_window_label: nextWindowLabel,
    message,
  };
}

export function assertClosingWindowOpen(now: Date = new Date()): ClosingWindowStatus {
  const status = evaluateClosingWindow(now);
  if (!status.is_open) {
    throw new Error(
      `CLOSING_WINDOW_LOCKED: ${status.message}`,
    );
  }
  return status;
}

export function resolvePeriodKey(
  month?: number | string | null,
  year?: number | string | null,
  periodName?: string | null,
): string {
  const numMonth = Number(month);
  const numYear = Number(year);
  if (numMonth >= 1 && numMonth <= 12 && numYear > 1900) {
    return `${numYear}-${String(numMonth).padStart(2, "0")}`;
  }

  const raw = String(periodName || "").trim();
  if (/^\d{4}-\d{2}/.test(raw)) {
    return raw.slice(0, 7);
  }

  if (raw) {
    const tokens = raw.split(/[\s\-/]+/).filter(Boolean);
    if (tokens.length >= 2) {
      let detectedMonth = 0;
      let detectedYear = 0;
      for (const tok of tokens) {
        const asNum = Number(tok);
        if (!isNaN(asNum) && asNum > 1900) {
          detectedYear = asNum;
        } else if (!isNaN(asNum) && asNum >= 1 && asNum <= 12) {
          detectedMonth = asNum;
        } else {
          const mFull = MONTH_NAMES_EN.findIndex((m) => m.toLowerCase() === tok.toLowerCase());
          const mShort = SHORT_MONTHS.findIndex((m) => m.toLowerCase() === tok.toLowerCase());
          const mId = MONTH_NAMES_ID.findIndex((m) => m.toLowerCase() === tok.toLowerCase());
          if (mFull >= 0) detectedMonth = mFull + 1;
          else if (mShort >= 0) detectedMonth = mShort + 1;
          else if (mId >= 0) detectedMonth = mId + 1;
        }
      }
      if (detectedMonth >= 1 && detectedYear > 1900) {
        return `${detectedYear}-${String(detectedMonth).padStart(2, "0")}`;
      }
    }
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getPeriodBounds(periodKey: string): {
  period_key: string;
  year: number;
  month: number;
  period_name: string;
  period_name_id: string;
  start_date: string;
  end_date: string;
} {
  const normalized = /^\d{4}-\d{2}$/.test(String(periodKey || "").trim())
    ? String(periodKey).trim()
    : resolvePeriodKey();
  const [yStr, mStr] = normalized.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return {
    period_key: normalized,
    year,
    month,
    period_name: `${MONTH_NAMES_EN[month - 1] || mm} ${year}`,
    period_name_id: `${MONTH_NAMES_ID[month - 1] || mm} ${year}`,
    start_date: `${year}-${mm}-01`,
    end_date: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Backfills canonical YYYY-MM period_key on HRIS & Finance Payroll tables
 * so historical string-based periods reconcile deterministically.
 */
export function backfillPayrollPeriodKeys(db: Database.Database): void {
  try {
    const prqs = db
      .prepare(
        "SELECT id, period_month, period_year, period_name FROM payroll_requisitions WHERE period_key IS NULL OR period_key = ''",
      )
      .all() as any[];
    const updPrq = db.prepare("UPDATE payroll_requisitions SET period_key = ? WHERE id = ?");
    for (const r of prqs) {
      updPrq.run(resolvePeriodKey(r.period_month, r.period_year, r.period_name), r.id);
    }

    const fPayrolls = db
      .prepare(
        "SELECT id, period_month, period_year, period_name FROM finance_payroll WHERE period_key IS NULL OR period_key = ''",
      )
      .all() as any[];
    const updFp = db.prepare("UPDATE finance_payroll SET period_key = ? WHERE id = ?");
    for (const r of fPayrolls) {
      updFp.run(resolvePeriodKey(r.period_month, r.period_year, r.period_name), r.id);
    }

    const slips = db
      .prepare(
        "SELECT id, period_month FROM hr_payslips WHERE period_key IS NULL OR period_key = ''",
      )
      .all() as any[];
    const updSlip = db.prepare("UPDATE hr_payslips SET period_key = ? WHERE id = ?");
    for (const r of slips) {
      updSlip.run(resolvePeriodKey(null, null, r.period_month), r.id);
    }
  } catch (err) {
    console.warn("[ClosingEngine] Backfill period_key skipped:", err);
  }
}

export function ensureAccountingPeriodExists(db: Database.Database, periodKey: string): any {
  const bounds = getPeriodBounds(periodKey);
  let period = db
    .prepare("SELECT * FROM accounting_periods WHERE period_key = ?")
    .get(bounds.period_key) as any;

  if (!period) {
    const id = `PER-${bounds.period_key}`;
    db.prepare(`
      INSERT OR IGNORE INTO accounting_periods (
        id, period_key, period_name, start_date, end_date, status, notes
      ) VALUES (?, ?, ?, ?, ?, 'OPEN', 'Auto-initialized for monthly closing workspace')
    `).run(id, bounds.period_key, bounds.period_name, bounds.start_date, bounds.end_date);
    period = db
      .prepare("SELECT * FROM accounting_periods WHERE period_key = ?")
      .get(bounds.period_key) as any;
  }
  return period;
}

export interface DefaultChecklistTemplate {
  item_code: string;
  category: "HRIS_PRQ" | "BANK_CASH" | "TAX" | "INVENTORY_WIP" | "ADJUSTMENT";
  title: string;
  description: string;
  assigned_role: string;
  requirement_type: "AUTO_GATE" | "UPLOAD_AND_FORM" | "FORM_ONLY";
  due_day: number;
  sort_order: number;
  form_schema: Array<{
    key: string;
    label: string;
    type: "currency" | "text" | "date" | "number" | "textarea" | "boolean";
    required?: boolean;
    placeholder?: string;
  }>;
}

export const DEFAULT_CLOSING_ITEMS: DefaultChecklistTemplate[] = [
  {
    item_code: "GATE_HRIS_ATTENDANCE_OVERTIME",
    category: "HRIS_PRQ",
    title: "HRIS Attendance, Leave & Salary Master",
    description: "Zero pending leave/overtime requests and complete employee salary masters.",
    assigned_role: "HR",
    requirement_type: "AUTO_GATE",
    due_day: 18,
    sort_order: 1,
    form_schema: [],
  },
  {
    item_code: "GATE_PRQ_DISBURSEMENT_GL",
    category: "HRIS_PRQ",
    title: "PRq → PDV → Payslips → GL Integration",
    description: "Approved PRq, settled PDV disbursement, paid payslips, and posted GL entries.",
    assigned_role: "HR & FINANCE",
    requirement_type: "AUTO_GATE",
    due_day: 21,
    sort_order: 2,
    form_schema: [],
  },
  {
    item_code: "GATE_AR_AP_CUTOFF",
    category: "INVENTORY_WIP",
    title: "AR Invoicing & Cash Ledger Cut-Off",
    description: "All shipped Delivery Notes invoiced and all cash transactions journalized.",
    assigned_role: "FINANCE",
    requirement_type: "AUTO_GATE",
    due_day: 22,
    sort_order: 3,
    form_schema: [],
  },
  {
    item_code: "GATE_INVENTORY_GRNI",
    category: "INVENTORY_WIP",
    title: "Warehouse GRN & GRNI Accrual Sync",
    description: "All QC-passed GRNs posted to Inventory and GRNI (2105) accrual accounts.",
    assigned_role: "WAREHOUSE & FINANCE",
    requirement_type: "AUTO_GATE",
    due_day: 22,
    sort_order: 4,
    form_schema: [],
  },
  {
    item_code: "GATE_TRIAL_BALANCE",
    category: "ADJUSTMENT",
    title: "Trial Balance Equilibrium",
    description: "Zero debit-to-credit variance across period and cumulative General Ledger.",
    assigned_role: "FINANCE",
    requirement_type: "AUTO_GATE",
    due_day: 24,
    sort_order: 5,
    form_schema: [],
  },
  {
    item_code: "REQ_BANK_RECONCILIATION",
    category: "BANK_CASH",
    title: "Bank Statement Reconciliation (COA 1101)",
    description: "Reconcile closing bank statement balance against GL 1101 and attach statement.",
    assigned_role: "FINANCE",
    requirement_type: "UPLOAD_AND_FORM",
    due_day: 20,
    sort_order: 6,
    form_schema: [
      { key: "bank_name", label: "Bank & Account Number", type: "text", required: true, placeholder: "e.g. BCA 012-345-6789" },
      { key: "bank_statement_balance", label: "Closing Bank Statement Balance (IDR)", type: "currency", required: true, placeholder: "0" },
      { key: "reconciliation_notes", label: "Reconciliation Notes", type: "textarea", required: false, placeholder: "Note any bank charges or unpresented items..." },
    ],
  },
  {
    item_code: "REQ_TAX_FILING_PPN_PPH",
    category: "TAX",
    title: "Monthly Tax Filing & Payment (VAT / WHT)",
    description: "Record tax payment reference (NTPN/BPE), paid amounts, and attach receipts.",
    assigned_role: "FINANCE",
    requirement_type: "UPLOAD_AND_FORM",
    due_day: 22,
    sort_order: 7,
    form_schema: [
      { key: "ntpn_number", label: "Tax Payment Reference (NTPN / BPE)", type: "text", required: true, placeholder: "e.g. NTPN-8F9A21BC34" },
      { key: "ppn_paid_amount", label: "VAT / PPN Settled Amount (IDR)", type: "currency", required: true, placeholder: "0" },
      { key: "pph_paid_amount", label: "Withholding Tax PPh 21/23 Paid (IDR)", type: "currency", required: true, placeholder: "0" },
      { key: "tax_notes", label: "Compliance Notes", type: "textarea", required: false, placeholder: "Monthly e-Faktur & e-Bupot filing notes..." },
    ],
  },
  {
    item_code: "REQ_STOCK_OPNAME_BA",
    category: "INVENTORY_WIP",
    title: "Physical Inventory Stock Count",
    description: "Submit stock count date, SKU count, variance value, and signed count sheet.",
    assigned_role: "WAREHOUSE",
    requirement_type: "UPLOAD_AND_FORM",
    due_day: 21,
    sort_order: 8,
    form_schema: [
      { key: "opname_date", label: "Stock Count Date", type: "date", required: true },
      { key: "sku_counted", label: "Total SKUs Counted", type: "number", required: true, placeholder: "0" },
      { key: "variance_value", label: "Inventory Variance Value (IDR)", type: "currency", required: true, placeholder: "0" },
      { key: "opname_notes", label: "Variance & Condition Notes", type: "textarea", required: false, placeholder: "Summary of warehouse count variances..." },
    ],
  },
  {
    item_code: "REQ_PETTY_CASH_OPNAME",
    category: "BANK_CASH",
    title: "Petty Cash Physical Count",
    description: "Record physical cash count total, custodian name, and attach cash count sheet.",
    assigned_role: "FINANCE",
    requirement_type: "UPLOAD_AND_FORM",
    due_day: 21,
    sort_order: 9,
    form_schema: [
      { key: "physical_cash_count", label: "Physical Cash Balance (IDR)", type: "currency", required: true, placeholder: "0" },
      { key: "custodian_name", label: "Cash Custodian", type: "text", required: true, placeholder: "Full name of custodian" },
      { key: "petty_cash_notes", label: "Pending Vouchers / Notes", type: "textarea", required: false, placeholder: "Note any unreplenished vouchers or variance..." },
    ],
  },
  {
    item_code: "REQ_ACCRUAL_DEPRECIATION",
    category: "ADJUSTMENT",
    title: "Month-End Accruals & Depreciation Sign-Off",
    description: "Confirm review and posting of utility accruals, asset depreciation, and adjustments.",
    assigned_role: "FINANCE",
    requirement_type: "FORM_ONLY",
    due_day: 23,
    sort_order: 10,
    form_schema: [
      { key: "depreciation_amount", label: "Total Accruals & Depreciation (IDR)", type: "currency", required: true, placeholder: "0" },
      { key: "adjustment_confirmed", label: "Confirm all period accruals and depreciation are posted", type: "boolean", required: true },
      { key: "adjustment_notes", label: "Adjustment Summary", type: "textarea", required: true, placeholder: "List month-end adjustments or state 'No additional adjustments'..." },
    ],
  },
];

export function ensurePeriodClosingChecklist(db: Database.Database, periodKey: string): void {
  const period = ensureAccountingPeriodExists(db, periodKey);

  const upsertStmt = db.prepare(`
    INSERT INTO closing_required_items (
      id, period_key, item_code, category, title, description, assigned_role,
      requirement_type, is_required, due_day, status, form_schema_json, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'PENDING', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      form_schema_json = excluded.form_schema_json
    WHERE ? != 'HARD_CLOSED'
  `);

  for (const tpl of DEFAULT_CLOSING_ITEMS) {
    const id = `CRI-${periodKey}-${tpl.item_code}`;
    upsertStmt.run(
      id,
      periodKey,
      tpl.item_code,
      tpl.category,
      tpl.title,
      tpl.description,
      tpl.assigned_role,
      tpl.requirement_type,
      tpl.due_day,
      JSON.stringify(tpl.form_schema),
      tpl.sort_order,
      period?.status || "OPEN",
    );
  }
}

export interface AutoGateEvaluation {
  item_code: string;
  passed: boolean;
  summary: string;
  diagnostics: Record<string, any>;
}

export function evaluateSystemGates(db: Database.Database, periodKey: string): {
  gates: Record<string, AutoGateEvaluation>;
  hrisPrqSummary: Record<string, any>;
  cutoffMetrics: Record<string, any>;
} {
  backfillPayrollPeriodKeys(db);
  const bounds = getPeriodBounds(periodKey);

  // 1. HRIS Readiness: Leaves, Overtime, Salary Master
  const activeUsers = db
    .prepare(
      "SELECT username, name, role, level FROM users WHERE status IN ('APPROVED', 'ACTIVE') OR status IS NULL OR status = ''",
    )
    .all() as any[];

  const salaries = db.prepare("SELECT employee_username, basic_salary FROM hr_salaries").all() as any[];
  const salaryMap = new Map(salaries.map((s) => [String(s.employee_username || "").toLowerCase(), Number(s.basic_salary || 0)]));

  const missingSalaryUsers = activeUsers
    .filter((u) => !salaryMap.has(String(u.username || "").toLowerCase()))
    .map((u) => ({ username: u.username, name: u.name || u.username, role: u.role }));

  const pendingLeaves = db
    .prepare(
      `SELECT id, employee_username, leave_type, start_date, end_date
       FROM hr_leaves
       WHERE status = 'PENDING' AND (start_date LIKE ? OR end_date LIKE ?)`,
    )
    .all(`${periodKey}%`, `${periodKey}%`) as any[];

  const pendingScheduledOvertime = db
    .prepare(
      `SELECT id, project_id, manpower_id, date, overtime_hours
       FROM project_overtime_schedules
       WHERE status = 'PENDING' AND date LIKE ?`,
    )
    .all(`${periodKey}%`) as any[];

  let pendingAttendanceOvertime: any[] = [];
  try {
    pendingAttendanceOvertime = db
      .prepare(
        `SELECT id, employee_username, date, overtime_hours
         FROM attendance_db.hr_attendances
         WHERE overtime_status = 'PENDING' AND date LIKE ?`,
      )
      .all(`${periodKey}%`) as any[];
  } catch {
    pendingAttendanceOvertime = [];
  }

  const totalPendingOt = pendingScheduledOvertime.length + pendingAttendanceOvertime.length;
  const hrisPassed =
    pendingLeaves.length === 0 &&
    totalPendingOt === 0 &&
    missingSalaryUsers.length === 0;

  // 2. PRq -> Finance PDV -> HR Payslips -> GL Journal Integration
  const prqRow = db
    .prepare(
      `SELECT * FROM payroll_requisitions
       WHERE (period_key = ? OR (period_month = ? AND period_year = ?))
         AND status NOT IN ('REJECTED', 'CANCELLED')
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(periodKey, bounds.month, bounds.year) as any;

  const payrollOrder = db
    .prepare(
      `SELECT * FROM finance_payroll
       WHERE (prq_id = ? OR period_key = ? OR (period_month = ? AND period_year = ?) OR LOWER(TRIM(period_name)) = LOWER(TRIM(?)))
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(prqRow?.id || "__NONE__", periodKey, bounds.month, bounds.year, bounds.period_name) as any;

  const payslips = db
    .prepare(
      `SELECT id, employee_username, status, net_salary
       FROM hr_payslips
       WHERE period_key = ? OR LOWER(TRIM(period_month)) = LOWER(TRIM(?))`,
    )
    .all(periodKey, bounds.period_name) as any[];

  const paidPayslipsCount = payslips.filter((s) => s.status === "PAID").length;
  const unpaidPayslipsCount = payslips.filter((s) => s.status !== "PAID").length;

  let payrollJournals: any[] = [];
  if (payrollOrder?.id) {
    payrollJournals = db
      .prepare(
        `SELECT id, entry_number, entry_date, total_debit, total_credit
         FROM journal_entries
         WHERE reference_type = 'PAYROLL' AND reference_id = ?`,
      )
      .all(payrollOrder.id) as any[];
  }

  let prqDetails: any[] = [];
  try {
    prqDetails = JSON.parse(prqRow?.details_json || "[]");
  } catch {
    prqDetails = [];
  }

  const prqConverted = prqRow?.status === "CONVERTED";
  const pdvPaid = payrollOrder && (payrollOrder.status === "PAID" || payrollOrder.status === "FINISHED");
  const payslipsSettled = payslips.length > 0 && unpaidPayslipsCount === 0;
  const payrollJournalPosted = payrollJournals.length > 0;
  const prqPassed = Boolean(prqRow && prqConverted && pdvPaid && payslipsSettled && payrollJournalPosted);

  const prqBlockers: string[] = [];
  if (!prqRow) prqBlockers.push("Payroll requisition (PRq) has not been submitted by HR");
  else if (!prqConverted) prqBlockers.push(`PRq ${prqRow.requisition_number} is still ${prqRow.status} (awaiting Finance conversion)`);
  if (!payrollOrder) prqBlockers.push("Finance Payroll Disbursement Order (PDV) not issued");
  else if (!pdvPaid) prqBlockers.push(`PDV ${payrollOrder.voucher_number || payrollOrder.id} is still ${payrollOrder.status} (unpaid)`);
  if (payslips.length === 0) prqBlockers.push("Employee payslips not generated for this period");
  else if (unpaidPayslipsCount > 0) prqBlockers.push(`${unpaidPayslipsCount} employee payslip(s) not settled`);
  if (payrollOrder && pdvPaid && !payrollJournalPosted) prqBlockers.push("PDV settled but PAYROLL GL journal entry is missing");

  // 3. AR/AP Cut-Off & Unjournaled Finance Transactions
  const uninvoicedDns = db
    .prepare(
      `SELECT dn.id, dn.dn_number, dn.status, dn.created_at
       FROM delivery_notes dn
       WHERE dn.status IN ('DELIVERED', 'COMPLETED', 'SHIPPED', 'DISPATCHED')
         AND (dn.invoiced_at IS NULL OR dn.invoiced_at = '')
         AND strftime('%Y-%m', COALESCE(dn.delivered_at, dn.shipped_at, dn.created_at)) = ?
         AND NOT EXISTS (SELECT 1 FROM commercial_invoices ci WHERE ci.dn_id = dn.id)`,
    )
    .all(periodKey) as any[];

  const unjournaledTxs = db
    .prepare(
      `SELECT ft.id, ft.type, ft.category, ft.amount, ft.reference_id, ft.transaction_date, ft.notes
       FROM finance_transactions ft
       WHERE strftime('%Y-%m', COALESCE(ft.transaction_date, ft.created_at)) = ?
         AND NOT EXISTS (
           SELECT 1 FROM journal_entries je
           WHERE je.reference_id = ft.id
              OR (ft.reference_id IS NOT NULL AND ft.reference_id != '' AND je.reference_id = ft.reference_id)
         )`,
    )
    .all(periodKey) as any[];

  const cutoffPassed = uninvoicedDns.length === 0 && unjournaledTxs.length === 0;

  // 4. Inventory & GRNI Sync
  const unpostedGrns = db
    .prepare(
      `SELECT g.id, g.po_id, g.received_date, g.qc_status
       FROM grns g
       WHERE g.qc_status IN ('PASSED', 'CONDITIONAL')
         AND strftime('%Y-%m', COALESCE(g.received_date, g.created_at)) = ?
         AND NOT EXISTS (
           SELECT 1 FROM journal_entries je WHERE je.reference_type = 'GRN' AND je.reference_id = g.id
         )`,
    )
    .all(periodKey) as any[];

  const grniBalanceRow = db
    .prepare(
      `SELECT COALESCE(SUM(jel.credit) - SUM(jel.debit), 0) as balance
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.entry_id = je.id
       WHERE jel.account_code = '2105'
         AND strftime('%Y-%m', je.entry_date) <= ?`,
    )
    .get(periodKey) as { balance: number } | undefined;

  const inventoryPassed = unpostedGrns.length === 0;

  // 5. Trial Balance Equilibrium (Period-scoped & Cumulative)
  const periodTotals = db
    .prepare(
      `SELECT
         COUNT(DISTINCT je.id) as journal_count,
         COALESCE(SUM(jel.debit), 0) as total_debit,
         COALESCE(SUM(jel.credit), 0) as total_credit
       FROM journal_entries je
       LEFT JOIN journal_entry_lines jel ON jel.entry_id = je.id
       WHERE strftime('%Y-%m', je.entry_date) = ?`,
    )
    .get(periodKey) as { journal_count: number; total_debit: number; total_credit: number };

  const cumulativeTotals = db
    .prepare(
      `SELECT
         COALESCE(SUM(jel.debit), 0) as total_debit,
         COALESCE(SUM(jel.credit), 0) as total_credit
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.entry_id = je.id
       WHERE strftime('%Y-%m', je.entry_date) <= ?`,
    )
    .get(periodKey) as { total_debit: number; total_credit: number };

  const periodDiff = Math.abs(Number(periodTotals.total_debit || 0) - Number(periodTotals.total_credit || 0));
  const cumulativeDiff = Math.abs(Number(cumulativeTotals.total_debit || 0) - Number(cumulativeTotals.total_credit || 0));
  const tbPassed = periodDiff < 1 && cumulativeDiff < 1;

  const gates: Record<string, AutoGateEvaluation> = {
    GATE_HRIS_ATTENDANCE_OVERTIME: {
      item_code: "GATE_HRIS_ATTENDANCE_OVERTIME",
      passed: hrisPassed,
      summary: hrisPassed
        ? `${activeUsers.length} active employees verified · 0 pending leave/overtime.`
        : `${pendingLeaves.length} pending leave · ${totalPendingOt} pending overtime · ${missingSalaryUsers.length} missing salary master`,
      diagnostics: {
        active_employees: activeUsers.length,
        pending_leaves: pendingLeaves.length,
        pending_overtime: totalPendingOt,
        missing_salary_count: missingSalaryUsers.length,
        missing_salary_users: missingSalaryUsers.slice(0, 10),
      },
    },
    GATE_PRQ_DISBURSEMENT_GL: {
      item_code: "GATE_PRQ_DISBURSEMENT_GL",
      passed: prqPassed,
      summary: prqPassed
        ? `PRq ${prqRow.requisition_number} → ${payrollOrder.voucher_number || payrollOrder.id} paid · ${paidPayslipsCount} payslips posted.`
        : prqBlockers.join(" · "),
      diagnostics: {
        prq_id: prqRow?.id || null,
        prq_number: prqRow?.requisition_number || null,
        prq_status: prqRow?.status || "MISSING",
        payroll_id: payrollOrder?.id || null,
        voucher_number: payrollOrder?.voucher_number || null,
        payroll_status: payrollOrder?.status || "MISSING",
        payslips_total: payslips.length,
        payslips_paid: paidPayslipsCount,
        payroll_journal_count: payrollJournals.length,
        blockers: prqBlockers,
      },
    },
    GATE_AR_AP_CUTOFF: {
      item_code: "GATE_AR_AP_CUTOFF",
      passed: cutoffPassed,
      summary: cutoffPassed
        ? "0 uninvoiced delivery notes · 0 unjournaled cash transactions."
        : `${uninvoicedDns.length} uninvoiced DN(s) · ${unjournaledTxs.length} unjournaled cash tx(s)`,
      diagnostics: {
        uninvoiced_dn_count: uninvoicedDns.length,
        uninvoiced_dns: uninvoicedDns.slice(0, 10),
        unjournaled_tx_count: unjournaledTxs.length,
        unjournaled_txs: unjournaledTxs.slice(0, 10),
      },
    },
    GATE_INVENTORY_GRNI: {
      item_code: "GATE_INVENTORY_GRNI",
      passed: inventoryPassed,
      summary: inventoryPassed
        ? `All GRNs posted · GRNI (2105) balance Rp ${Math.round(grniBalanceRow?.balance || 0).toLocaleString("en-US")}.`
        : `${unpostedGrns.length} QC-passed GRN(s) awaiting inventory accrual posting.`,
      diagnostics: {
        unposted_grn_count: unpostedGrns.length,
        unposted_grns: unpostedGrns.slice(0, 10),
        grni_2105_balance: Number(grniBalanceRow?.balance || 0),
      },
    },
    GATE_TRIAL_BALANCE: {
      item_code: "GATE_TRIAL_BALANCE",
      passed: tbPassed,
      summary: tbPassed
        ? `Balanced across ${periodTotals.journal_count} journal entries (variance Rp 0).`
        : `GL imbalance detected: Period variance Rp ${Math.round(periodDiff)} · Cumulative Rp ${Math.round(cumulativeDiff)}.`,
      diagnostics: {
        period_journal_count: Number(periodTotals.journal_count || 0),
        period_debit: Number(periodTotals.total_debit || 0),
        period_credit: Number(periodTotals.total_credit || 0),
        period_diff: periodDiff,
        cumulative_diff: cumulativeDiff,
      },
    },
  };

  const hrisPrqSummary = {
    period_key: periodKey,
    period_name: bounds.period_name,
    active_employees: activeUsers.length,
    missing_salary_count: missingSalaryUsers.length,
    pending_leaves_count: pendingLeaves.length,
    pending_overtime_count: totalPendingOt,
    prq_id: prqRow?.id || null,
    prq_number: prqRow?.requisition_number || null,
    prq_status: prqRow?.status || "MISSING",
    prq_submitted_by: prqRow?.submitted_by || null,
    prq_submitted_at: prqRow?.submitted_at || null,
    headcount: prqDetails.length || payslips.length || 0,
    total_gross: Number(prqRow?.total_gross || 0),
    total_deductions: Number(prqRow?.total_deductions || 0),
    total_net: Number(prqRow?.total_net || payrollOrder?.total_amount || 0),
    direct_labor_cost: Number(prqRow?.total_direct_labor || payrollOrder?.total_direct_labor || 0),
    opex_salary_cost: Number(prqRow?.total_opex || payrollOrder?.total_opex || 0),
    payroll_id: payrollOrder?.id || null,
    voucher_number: payrollOrder?.voucher_number || null,
    payroll_status: payrollOrder?.status || "MISSING",
    payroll_paid_at: payrollOrder?.paid_at || null,
    payslips_total: payslips.length,
    payslips_paid: paidPayslipsCount,
    journal_entries: payrollJournals,
    is_reconciled: prqPassed && hrisPassed,
    blockers: prqBlockers,
  };

  return {
    gates,
    hrisPrqSummary,
    cutoffMetrics: {
      uninvoiced_dn_count: uninvoicedDns.length,
      unjournaled_tx_count: unjournaledTxs.length,
      unposted_grn_count: unpostedGrns.length,
      grni_2105_balance: Number(grniBalanceRow?.balance || 0),
      period_journal_count: Number(periodTotals.journal_count || 0),
    },
  };
}

export function computePeriodFinancialPackage(db: Database.Database, periodKey: string) {
  const bounds = getPeriodBounds(periodKey);

  // Period-scoped Trial Balance with Opening, Period Mutation, Ending Balance
  const tbRows = db
    .prepare(`
      SELECT
        coa.code,
        coa.name,
        coa.category,
        coa.type,
        coa.normal_balance,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', je.entry_date) < ? THEN jel.debit ELSE 0 END), 0) as open_debit,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', je.entry_date) < ? THEN jel.credit ELSE 0 END), 0) as open_credit,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', je.entry_date) = ? THEN jel.debit ELSE 0 END), 0) as period_debit,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', je.entry_date) = ? THEN jel.credit ELSE 0 END), 0) as period_credit,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', je.entry_date) <= ? THEN jel.debit ELSE 0 END), 0) as close_debit,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', je.entry_date) <= ? THEN jel.credit ELSE 0 END), 0) as close_credit
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel ON coa.code = jel.account_code
      LEFT JOIN journal_entries je ON jel.entry_id = je.id
      GROUP BY coa.code, coa.name, coa.category, coa.type, coa.normal_balance
      ORDER BY coa.code ASC
    `)
    .all(periodKey, periodKey, periodKey, periodKey, periodKey, periodKey) as any[];

  let totalPeriodDebit = 0;
  let totalPeriodCredit = 0;
  let totalClosingDebit = 0;
  let totalClosingCredit = 0;

  let revenue = 0;
  let cogsMaterial = 0;
  let cogsLabor = 0;
  let otherDirectCost = 0;
  let opexSalaries = 0;
  let opexGeneral = 0;
  let opexLogistics = 0;
  let otherOpex = 0;

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let cashBank1101 = 0;
  let ar1102 = 0;
  let inventoryTotal = 0;
  let ap2101 = 0;
  let vatOut2102 = 0;
  let bpjs2103 = 0;
  let pph2104 = 0;
  let vatIn1106 = 0;
  let grni2105 = 0;

  const trialBalance = tbRows.map((r) => {
    const pDeb = Number(r.period_debit || 0);
    const pCred = Number(r.period_credit || 0);
    const cDeb = Number(r.close_debit || 0);
    const cCred = Number(r.close_credit || 0);
    totalPeriodDebit += pDeb;
    totalPeriodCredit += pCred;

    const periodNet = r.normal_balance === "CREDIT" ? pCred - pDeb : pDeb - pCred;
    const closingSigned = r.normal_balance === "CREDIT" ? cCred - cDeb : cDeb - cCred;
    const endDeb = r.normal_balance === "DEBIT" ? Math.max(0, cDeb - cCred) : Math.max(0, cDeb - cCred);
    const endCred = r.normal_balance === "CREDIT" ? Math.max(0, cCred - cDeb) : Math.max(0, cCred - cDeb);

    let balanceDebit = 0;
    let balanceCredit = 0;
    const rawDiff = cDeb - cCred;
    if (rawDiff >= 0) balanceDebit = rawDiff;
    else balanceCredit = Math.abs(rawDiff);

    totalClosingDebit += balanceDebit;
    totalClosingCredit += balanceCredit;

    if (r.category === "REVENUE") revenue += periodNet;
    if (r.category === "EXPENSE") {
      if (r.code === "5101") cogsMaterial += periodNet;
      else if (r.code === "5102") cogsLabor += periodNet;
      else if (r.code.startsWith("5")) otherDirectCost += periodNet;
      else if (r.code === "6101") opexSalaries += periodNet;
      else if (r.code === "6102") opexGeneral += periodNet;
      else if (r.code === "6103") opexLogistics += periodNet;
      else otherOpex += periodNet;
    }

    if (r.category === "ASSET") totalAssets += cDeb - cCred;
    if (r.category === "LIABILITY") totalLiabilities += cCred - cDeb;
    if (r.category === "EQUITY") totalEquity += cCred - cDeb;

    if (r.code === "1101") cashBank1101 = cDeb - cCred;
    if (r.code === "1102") ar1102 = cDeb - cCred;
    if (["1103", "1104", "1105"].includes(r.code)) inventoryTotal += cDeb - cCred;
    if (r.code === "1106") vatIn1106 = cDeb - cCred;
    if (r.code === "2101") ap2101 = cCred - cDeb;
    if (r.code === "2102") vatOut2102 = cCred - cDeb;
    if (r.code === "2103") bpjs2103 = cCred - cDeb;
    if (r.code === "2104") pph2104 = cCred - cDeb;
    if (r.code === "2105") grni2105 = cCred - cDeb;

    return {
      code: r.code,
      name: r.name,
      category: r.category,
      type: r.type,
      normal_balance: r.normal_balance,
      period_debit: pDeb,
      period_credit: pCred,
      period_net: periodNet,
      closing_debit: endDeb,
      closing_credit: endCred,
      balance_debit: balanceDebit,
      balance_credit: balanceCredit,
      ending_balance: closingSigned,
    };
  });

  const totalCogs = cogsMaterial + cogsLabor + otherDirectCost;
  const grossProfit = revenue - totalCogs;
  const totalOpex = opexSalaries + opexGeneral + opexLogistics + otherOpex;
  const netProfit = grossProfit - totalOpex;

  // Period cash transactions breakdown
  const cashFlowRow = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE 0 END), 0) as cash_in,
        COALESCE(SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END), 0) as cash_out,
        COUNT(*) as tx_count
      FROM finance_transactions
      WHERE strftime('%Y-%m', COALESCE(transaction_date, created_at)) = ?
    `)
    .get(periodKey) as { cash_in: number; cash_out: number; tx_count: number };

  return {
    period_key: bounds.period_key,
    period_name: bounds.period_name,
    period_name_id: bounds.period_name_id,
    start_date: bounds.start_date,
    end_date: bounds.end_date,
    pnl: {
      revenue,
      cogs_material: cogsMaterial,
      cogs_labor: cogsLabor,
      other_direct_cost: otherDirectCost,
      total_cogs: totalCogs,
      gross_profit: grossProfit,
      gross_margin_pct: revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(2)) : 0,
      opex_salaries: opexSalaries,
      opex_general: opexGeneral,
      opex_logistics: opexLogistics,
      other_opex: otherOpex,
      total_opex: totalOpex,
      net_profit: netProfit,
      net_margin_pct: revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(2)) : 0,
    },
    balance_sheet: {
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_equity_before_current_pnl: totalEquity,
      current_period_net_profit: netProfit,
      cash_bank_1101: cashBank1101,
      accounts_receivable_1102: ar1102,
      inventory_total: inventoryTotal,
      accounts_payable_2101: ap2101,
      grni_accrual_2105: grni2105,
    },
    tax_bank_summary: {
      gl_cash_bank_1101: cashBank1101,
      cash_in_period: Number(cashFlowRow?.cash_in || 0),
      cash_out_period: Number(cashFlowRow?.cash_out || 0),
      net_cash_flow_period: Number(cashFlowRow?.cash_in || 0) - Number(cashFlowRow?.cash_out || 0),
      cash_tx_count: Number(cashFlowRow?.tx_count || 0),
      vat_output_2102: vatOut2102,
      vat_input_1106: vatIn1106,
      net_vat_payable: vatOut2102 - vatIn1106,
      bpjs_payable_2103: bpjs2103,
      pph_payable_2104: pph2104,
    },
    trial_balance: trialBalance,
    trial_balance_summary: {
      period_debit: totalPeriodDebit,
      period_credit: totalPeriodCredit,
      closing_debit: totalClosingDebit,
      closing_credit: totalClosingCredit,
      is_balanced:
        Math.abs(totalPeriodDebit - totalPeriodCredit) < 1 &&
        Math.abs(totalClosingDebit - totalClosingCredit) < 1,
    },
  };
}

export function buildFullClosingWorkspaceState(
  db: Database.Database,
  periodKey: string,
  now: Date = new Date(),
) {
  const normalizedKey = resolvePeriodKey(null, null, periodKey);
  ensurePeriodClosingChecklist(db, normalizedKey);

  const windowStatus = evaluateClosingWindow(now);
  const period = db
    .prepare("SELECT * FROM accounting_periods WHERE period_key = ?")
    .get(normalizedKey) as any;

  const { gates, hrisPrqSummary, cutoffMetrics } = evaluateSystemGates(db, normalizedKey);

  // Sync AUTO_GATE rows cleanly so DB status reflects live truth (preserve immutability if HARD_CLOSED)
  if (period?.status !== "HARD_CLOSED") {
    const updateGateStmt = db.prepare(`
      UPDATE closing_required_items
      SET status = ?,
          system_diagnostic_json = ?,
          verified_by = CASE WHEN ? = 1 THEN 'SYSTEM_AUTO_AUDIT' ELSE NULL END,
          verified_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE period_key = ? AND item_code = ? AND requirement_type = 'AUTO_GATE'
    `);

    db.transaction(() => {
      for (const [code, evalRes] of Object.entries(gates)) {
        const nextStatus = evalRes.passed ? "VERIFIED" : "PENDING";
        updateGateStmt.run(
          nextStatus,
          JSON.stringify({ summary: evalRes.summary, ...evalRes.diagnostics }),
          evalRes.passed ? 1 : 0,
          evalRes.passed ? 1 : 0,
          normalizedKey,
          code,
        );
      }
    })();
  }

  const rawItems = db
    .prepare(
      `SELECT * FROM closing_required_items
       WHERE period_key = ?
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(normalizedKey) as any[];

  const items = rawItems.map((it) => {
    let formSchema = [];
    let payload = {};
    let attachments: string[] = [];
    let diagnostics = {};
    try { formSchema = JSON.parse(it.form_schema_json || "[]"); } catch {}
    try { payload = JSON.parse(it.payload_json || "{}"); } catch {}
    try { attachments = JSON.parse(it.attachment_urls_json || "[]"); } catch {}
    try { diagnostics = JSON.parse(it.system_diagnostic_json || "{}"); } catch {}
    return {
      ...it,
      is_required: Boolean(it.is_required),
      form_schema: formSchema,
      payload,
      attachment_urls: attachments,
      system_diagnostic: diagnostics,
    };
  });

  const requiredItems = items.filter((i) => i.is_required);
  const completedRequired = requiredItems.filter((i) => i.status === "VERIFIED");
  const pendingRequired = requiredItems.filter((i) => i.status !== "VERIFIED");

  const financialPackage = computePeriodFinancialPackage(db, normalizedKey);

  const snapshots = db
    .prepare(
      `SELECT id, period_key, version, status, sealed_by, sealed_at, notes
       FROM closing_snapshots
       WHERE period_key = ?
       ORDER BY version DESC, sealed_at DESC`,
    )
    .all(normalizedKey) as any[];

  const allRequiredSatisfied = requiredItems.length > 0 && pendingRequired.length === 0;
  const isHardClosed = period?.status === "HARD_CLOSED";
  const hasSnapshot = snapshots.length > 0;

  const blockingReasons: string[] = [];
  if (!windowStatus.is_open && !isHardClosed) {
    blockingReasons.push(windowStatus.message);
  }
  if (!allRequiredSatisfied) {
    blockingReasons.push(
      `${pendingRequired.length} of ${requiredItems.length} closing items pending verification`,
    );
  }
  if (!financialPackage.trial_balance_summary.is_balanced) {
    blockingReasons.push("Trial Balance for this period is not balanced");
  }

  return {
    period,
    window_status: windowStatus,
    checklist_summary: {
      total_items: items.length,
      required_total: requiredItems.length,
      required_verified: completedRequired.length,
      required_pending: pendingRequired.length,
      completion_pct:
        requiredItems.length > 0
          ? Math.round((completedRequired.length / requiredItems.length) * 100)
          : 0,
      all_required_satisfied: allRequiredSatisfied,
      pending_titles: pendingRequired.map((i) => i.title),
    },
    items,
    hris_prq_summary: hrisPrqSummary,
    cutoff_metrics: cutoffMetrics,
    financial_preview: financialPackage,
    snapshots,
    gates: {
      can_submit_items: windowStatus.is_open && !isHardClosed,
      can_soft_lock: windowStatus.is_open && period?.status === "OPEN",
      can_hard_close:
        windowStatus.is_open &&
        !isHardClosed &&
        allRequiredSatisfied &&
        financialPackage.trial_balance_summary.is_balanced,
      can_generate_report:
        (isHardClosed && hasSnapshot) ||
        (windowStatus.is_open && allRequiredSatisfied && financialPackage.trial_balance_summary.is_balanced),
      blocking_reasons: blockingReasons,
    },
  };
}

export function createClosingSnapshot(
  db: Database.Database,
  periodKey: string,
  sealedBy: string,
  notes?: string,
) {
  const state = buildFullClosingWorkspaceState(db, periodKey);
  const latestVerRow = db
    .prepare("SELECT COALESCE(MAX(version), 0) as max_ver FROM closing_snapshots WHERE period_key = ?")
    .get(periodKey) as { max_ver: number };
  const nextVer = (latestVerRow?.max_ver || 0) + 1;
  const id = `CSNAP-${periodKey}-V${nextVer}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  const summary = {
    period_key: periodKey,
    period_name: state.period?.period_name || state.financial_preview.period_name,
    version: nextVer,
    required_verified: state.checklist_summary.required_verified,
    required_total: state.checklist_summary.required_total,
    sealed_by: sealedBy,
    sealed_at: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO closing_snapshots (
      id, period_key, version, status, summary_json, pnl_json, trial_balance_json,
      prq_summary_json, checklist_manifest_json, tax_bank_summary_json, sealed_by, sealed_at, notes
    ) VALUES (?, ?, ?, 'SEALED', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
  `).run(
    id,
    periodKey,
    nextVer,
    JSON.stringify(summary),
    JSON.stringify(state.financial_preview.pnl),
    JSON.stringify({
      rows: state.financial_preview.trial_balance,
      summary: state.financial_preview.trial_balance_summary,
      balance_sheet: state.financial_preview.balance_sheet,
    }),
    JSON.stringify(state.hris_prq_summary),
    JSON.stringify(
      state.items.map((it: any) => ({
        id: it.id,
        item_code: it.item_code,
        category: it.category,
        title: it.title,
        requirement_type: it.requirement_type,
        assigned_role: it.assigned_role,
        status: it.status,
        payload: it.payload,
        attachment_urls: it.attachment_urls,
        submitted_by: it.submitted_by,
        submitted_at: it.submitted_at,
        verified_by: it.verified_by,
        verified_at: it.verified_at,
      })),
    ),
    JSON.stringify(state.financial_preview.tax_bank_summary),
    sealedBy,
    notes || null,
  );

  return { id, version: nextVer, summary };
}
