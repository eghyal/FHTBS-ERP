import type Database from "better-sqlite3";
import crypto from "crypto";

export interface JournalLine {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface PostJournalParams {
  reference_type:
    | "GRN"
    | "DELIVERY_NOTE"
    | "COMMERCIAL_INVOICE"
    | "INVOICE_PAYMENT"
    | "PO_PAYMENT"
    | "VENDOR_BILL"
    | "WIP_MATERIAL_ISSUE"
    | "PRODUCTION_FINISH"
    | "PAYROLL"
    | "EXPENSE"
    | "VOID_REVERSAL"
    | "MANUAL_ADJUSTMENT";
  reference_id: string;
  reference_number: string;
  description: string;
  entry_date?: string;
  lines: JournalLine[];
  created_by?: string;
  allowSoftLockAdjustment?: boolean;
}

export function extractPeriodKeyFromDate(dateStr?: string): string {
  if (dateStr && /^\d{4}-\d{2}/.test(dateStr.trim())) {
    return dateStr.trim().slice(0, 7);
  }
  const targetDate = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(targetDate.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  return `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Check if the target accounting period is locked or closed.
 * Throws error if HARD_CLOSED, or if SOFT_LOCKED (unless adjustment is explicitly allowed).
 */
export function assertAccountingPeriodOpen(
  db: Database.Database,
  dateStr?: string,
  options?: { allowSoftLockAdjustment?: boolean; referenceType?: string },
): void {
  const periodKey = extractPeriodKeyFromDate(dateStr);
  let period: any = null;
  try {
    period = db
      .prepare("SELECT * FROM accounting_periods WHERE period_key = ?")
      .get(periodKey) as any;
  } catch {
    // Table may not exist yet during very first bootstrap before migrations
    return;
  }

  if (period) {
    if (period.status === "HARD_CLOSED") {
      throw new Error(
        `PERIOD CLOSED: Periode akuntansi ${period.period_name} (${period.period_key}) berstatus HARD_CLOSED dan telah disegel permanen. Transaksi baru ditolak.`,
      );
    }
    if (period.status === "SOFT_LOCKED") {
      const isAllowedAdjustment =
        Boolean(options?.allowSoftLockAdjustment) &&
        options?.referenceType === "MANUAL_ADJUSTMENT";
      if (!isAllowedAdjustment) {
        throw new Error(
          `PERIOD LOCKED: Periode akuntansi ${period.period_name} (${period.period_key}) berstatus SOFT_LOCKED untuk rekonsiliasi Tutup Buku. Hanya jurnal penyesuaian akuntansi yang diizinkan.`,
        );
      }
    }
  }
}

/**
 * Executes a balanced double-entry journal posting.
 * Enforces: sum(debit) === sum(credit) and period lock verification.
 */
export function postJournalEntry(
  db: Database.Database,
  params: PostJournalParams,
): string {
  const {
    reference_type,
    reference_id,
    reference_number,
    description,
    entry_date = new Date().toISOString(),
    lines,
    created_by = "SYSTEM",
    allowSoftLockAdjustment = false,
  } = params;

  // Enforce period lock integrity
  assertAccountingPeriodOpen(db, entry_date, {
    allowSoftLockAdjustment,
    referenceType: reference_type,
  });

  if (!lines || lines.length < 2) {
    throw new Error("Journal entry must contain at least two lines.");
  }

  const totalDebit = Math.round(lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0) * 100) / 100;

  // Verify balanced entry (allowing at most 1 cent tolerance for rounding)
  if (Math.abs(totalDebit - totalCredit) > 1) {
    throw new Error(
      `Unbalanced journal entry: Total Debit (${totalDebit}) does not equal Total Credit (${totalCredit}).`,
    );
  }

  const entryId = "JE-" + crypto.randomUUID();
  const dateParts = new Date(entry_date).toISOString().split("T")[0].replace(/-/g, "");
  const entryNumber = `JE-${dateParts}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;

  db.prepare(`
    INSERT INTO journal_entries (
      id, entry_number, entry_date, reference_type, reference_id, reference_number,
      description, total_debit, total_credit, status, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, CURRENT_TIMESTAMP)
  `).run(
    entryId,
    entryNumber,
    entry_date,
    reference_type,
    reference_id,
    reference_number,
    description,
    totalDebit,
    totalCredit,
    created_by,
  );

  const insertLine = db.prepare(`
    INSERT INTO journal_entry_lines (
      id, entry_id, account_code, account_name, debit, credit, memo
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const line of lines) {
    insertLine.run(
      "JEL-" + crypto.randomUUID(),
      entryId,
      line.account_code,
      line.account_name,
      Number(line.debit) || 0,
      Number(line.credit) || 0,
      line.memo || null,
    );
  }

  return entryNumber;
}

/**
 * Standard COA helpers for automated accounting hooks
 */

// 1. Goods Receipt Intake (Warehouse GRN)
export function postGoodsReceiptJournal(
  db: Database.Database,
  {
    grn_id,
    po_number,
    total_inventory_cost,
    user,
  }: {
    grn_id: string;
    po_number: string;
    total_inventory_cost: number;
    user?: string;
  },
) {
  if (total_inventory_cost <= 0) return null;

  return postJournalEntry(db, {
    reference_type: "GRN",
    reference_id: grn_id,
    reference_number: po_number,
    description: `Inventory Physical Intake for PO ${po_number} (GRN: ${grn_id})`,
    lines: [
      {
        account_code: "1104",
        account_name: "Raw Materials Inventory",
        debit: total_inventory_cost,
        credit: 0,
        memo: `Physical stock intake PO ${po_number}`,
      },
      {
        account_code: "2105",
        account_name: "Unbilled GRN Accrual (GRNI)",
        debit: 0,
        credit: total_inventory_cost,
        memo: `Accrued liability for PO ${po_number}`,
      },
    ],
    created_by: user || "WAREHOUSE_INTAKE",
  });
}

// 2. Outbound Dispatch / Delivery Note
export function postDeliveryDispatchJournal(
  db: Database.Database,
  {
    dn_id,
    dn_number,
    total_cogs,
    user,
  }: {
    dn_id: string;
    dn_number: string;
    total_cogs: number;
    user?: string;
  },
) {
  if (total_cogs <= 0) return null;

  return postJournalEntry(db, {
    reference_type: "DELIVERY_NOTE",
    reference_id: dn_id,
    reference_number: dn_number,
    description: `COGS Recognition for Outbound Dispatch ${dn_number}`,
    lines: [
      {
        account_code: "5101",
        account_name: "Cost of Goods Sold (COGS)",
        debit: total_cogs,
        credit: 0,
        memo: `COGS recognized upon dispatch ${dn_number}`,
      },
      {
        account_code: "1103",
        account_name: "Inventory - Finished Goods",
        debit: 0,
        credit: total_cogs,
        memo: `Inventory reduction on dispatch ${dn_number}`,
      },
    ],
    created_by: user || "LOGISTICS_DISPATCH",
  });
}

// 3. Commercial Invoice Generation
export function postCommercialInvoiceJournal(
  db: Database.Database,
  {
    ci_id,
    ci_number,
    dpp,
    ppn = 0,
    pph = 0,
    grand_total,
    user,
  }: {
    ci_id: string;
    ci_number: string;
    dpp: number;
    ppn?: number;
    pph?: number;
    grand_total: number;
    user?: string;
  },
) {
  if (grand_total <= 0) return null;

  const netReceivable = Math.max(0, grand_total - pph);
  const lines: JournalLine[] = [
    {
      account_code: "1102",
      account_name: "Accounts Receivable",
      debit: pph > 0 ? netReceivable : grand_total,
      credit: 0,
      memo: `AR created for Invoice ${ci_number}`,
    },
    {
      account_code: "4101",
      account_name: "Sales Operating Revenue",
      debit: 0,
      credit: dpp,
      memo: `Revenue recognized for Invoice ${ci_number}`,
    },
  ];

  if (ppn > 0) {
    lines.push({
      account_code: "2102",
      account_name: "Output VAT Payable",
      debit: 0,
      credit: ppn,
      memo: `Output VAT liability for ${ci_number}`,
    });
  }

  if (pph > 0) {
    lines.push({
      account_code: "1107",
      account_name: "Prepaid Withholding Tax",
      debit: pph,
      credit: 0,
      memo: `Prepaid withholding tax deduction for ${ci_number}`,
    });
  }

  return postJournalEntry(db, {
    reference_type: "COMMERCIAL_INVOICE",
    reference_id: ci_id,
    reference_number: ci_number,
    description: `Billing Recognition for Commercial Invoice ${ci_number}`,
    lines,
    created_by: user || "FINANCE_BILLING",
  });
}

// 3b. Down Payment (DP) Commercial Invoice Generation (Unearned Customer Deposit COA 2106)
export function postDownPaymentInvoiceJournal(
  db: Database.Database,
  {
    ci_id,
    ci_number,
    dp_dpp,
    dp_ppn = 0,
    dp_grand_total,
    is_paid = false,
    user,
  }: {
    ci_id: string;
    ci_number: string;
    dp_dpp: number;
    dp_ppn?: number;
    dp_grand_total: number;
    is_paid?: boolean;
    user?: string;
  },
) {
  if (dp_grand_total <= 0) return null;

  const lines: JournalLine[] = [
    {
      account_code: is_paid ? "1108" : "1102",
      account_name: is_paid
        ? "Storefront & Down Payment Cash/Bank"
        : "Accounts Receivable (Down Payment)",
      debit: dp_grand_total,
      credit: 0,
      memo: `Down Payment (DP) invoice billing/receipt ${ci_number}`,
    },
    {
      account_code: "2106",
      account_name: "Customer Deposits (Unearned Revenue)",
      debit: 0,
      credit: dp_dpp,
      memo: `Unearned customer deposit liability recognition ${ci_number}`,
    },
  ];

  if (dp_ppn > 0) {
    lines.push({
      account_code: "2102",
      account_name: "Output VAT Payable",
      debit: 0,
      credit: dp_ppn,
      memo: `Output VAT on Down Payment invoice ${ci_number}`,
    });
  }

  return postJournalEntry(db, {
    reference_type: "COMMERCIAL_INVOICE",
    reference_id: ci_id,
    reference_number: ci_number,
    description: `Down Payment (DP) Invoice Recognition ${ci_number}`,
    lines,
    created_by: user || "FINANCE_BILLING",
  });
}

// 3c. Final Settlement Commercial Invoice (Knock-off Customer Deposit COA 2106 & Recognize Full Revenue COA 4101)
export function postFinalSettlementInvoiceJournal(
  db: Database.Database,
  {
    ci_id,
    ci_number,
    full_dpp,
    full_ppn = 0,
    pph = 0,
    dp_dpp_deducted = 0,
    dp_ppn_deducted = 0,
    user,
  }: {
    ci_id: string;
    ci_number: string;
    full_dpp: number;
    full_ppn?: number;
    pph?: number;
    dp_dpp_deducted?: number;
    dp_ppn_deducted?: number;
    user?: string;
  },
) {
  const safeFullDpp = Math.max(0, Math.round(full_dpp));
  const safeFullPpn = Math.max(0, Math.round(full_ppn));
  const safeDpDpp = Math.min(safeFullDpp, Math.max(0, Math.round(dp_dpp_deducted)));
  const safeDpPpn = Math.min(safeFullPpn, Math.max(0, Math.round(dp_ppn_deducted)));
  const safePph = Math.max(0, Math.round(pph));

  const remainingPpn = Math.max(0, safeFullPpn - safeDpPpn);
  const netRemainingReceivable = Math.max(
    0,
    safeFullDpp + remainingPpn - safeDpDpp - safePph,
  );

  if (safeFullDpp <= 0) return null;

  const lines: JournalLine[] = [];

  if (netRemainingReceivable > 0) {
    lines.push({
      account_code: "1102",
      account_name: "Accounts Receivable (Final Settlement Balance)",
      debit: netRemainingReceivable,
      credit: 0,
      memo: `Remaining settlement receivable after DP deduction (${ci_number})`,
    });
  }

  if (safeDpDpp > 0) {
    lines.push({
      account_code: "2106",
      account_name: "Customer Deposits (Knock-off)",
      debit: safeDpDpp,
      credit: 0,
      memo: `Customer deposit knock-off on final settlement ${ci_number}`,
    });
  }

  if (safePph > 0) {
    lines.push({
      account_code: "1107",
      account_name: "Prepaid Withholding Tax",
      debit: safePph,
      credit: 0,
      memo: `Withholding tax deduction on final settlement ${ci_number}`,
    });
  }

  lines.push({
    account_code: "4101",
    account_name: "Sales Operating Revenue",
    debit: 0,
    credit: safeFullDpp,
    memo: `Full sales revenue recognition on final settlement ${ci_number}`,
  });

  if (remainingPpn > 0) {
    lines.push({
      account_code: "2102",
      account_name: "Output VAT Payable",
      debit: 0,
      credit: remainingPpn,
      memo: `Remaining output VAT on final settlement invoice ${ci_number}`,
    });
  }

  return postJournalEntry(db, {
    reference_type: "COMMERCIAL_INVOICE",
    reference_id: ci_id,
    reference_number: ci_number,
    description: `Final Settlement Invoice & DP Knock-off Recognition ${ci_number}`,
    lines,
    created_by: user || "FINANCE_BILLING",
  });
}

// 4. Commercial Invoice Payment Received
export function postInvoicePaymentJournal(
  db: Database.Database,
  {
    ci_id,
    ci_number,
    payment_amount,
    user,
  }: {
    ci_id: string;
    ci_number: string;
    payment_amount: number;
    user?: string;
  },
) {
  if (payment_amount <= 0) return null;

  return postJournalEntry(db, {
    reference_type: "INVOICE_PAYMENT",
    reference_id: ci_id,
    reference_number: ci_number,
    description: `Customer Payment Settlement for Invoice ${ci_number}`,
    lines: [
      {
        account_code: "1101",
        account_name: "Cash & Bank Accounts",
        debit: payment_amount,
        credit: 0,
        memo: `Payment received for ${ci_number}`,
      },
      {
        account_code: "1102",
        account_name: "Accounts Receivable",
        debit: 0,
        credit: payment_amount,
        memo: `AR settlement for ${ci_number}`,
      },
    ],
    created_by: user || "FINANCE_CASHIER",
  });
}

// 5. Purchase Order Settlement / Payment
export function postPurchaseOrderPaymentJournal(
  db: Database.Database,
  {
    po_id,
    po_number,
    payment_amount,
    user,
  }: {
    po_id: string;
    po_number: string;
    payment_amount: number;
    user?: string;
  },
) {
  if (payment_amount <= 0) return null;

  return postJournalEntry(db, {
    reference_type: "PO_PAYMENT",
    reference_id: po_id,
    reference_number: po_number,
    description: `Supplier Settlement for PO ${po_number}`,
    lines: [
      {
        account_code: "2101",
        account_name: "Accounts Payable",
        debit: payment_amount,
        credit: 0,
        memo: `AP settlement for PO ${po_number}`,
      },
      {
        account_code: "1101",
        account_name: "Cash & Bank Accounts",
        debit: 0,
        credit: payment_amount,
        memo: `Bank disbursement for PO ${po_number}`,
      },
    ],
    created_by: user || "FINANCE_DISBURSEMENT",
  });
}

// 6. Payroll Disbursement Posting with Direct Labor (HPP/BTKL) vs OPEX separation
export function postPayrollDisbursementJournal(
  db: Database.Database,
  {
    payroll_id,
    voucher_number,
    period_name,
    entry_date,
    total_direct_labor,
    total_opex,
    total_net,
    total_bpjs = 0,
    total_pph21 = 0,
    user,
  }: {
    payroll_id: string;
    voucher_number: string;
    period_name: string;
    entry_date?: string;
    total_direct_labor: number;
    total_opex: number;
    total_net: number;
    total_bpjs?: number;
    total_pph21?: number;
    user?: string;
  },
) {
  const lines: JournalLine[] = [];

  // Debits: Direct Labor to HPP (Account 5102)
  if (total_direct_labor > 0) {
    lines.push({
      account_code: "5102",
      account_name: "Direct Labor Cost (COGS)",
      debit: total_direct_labor,
      credit: 0,
      memo: `Direct factory labor & overtime for ${period_name}`,
    });
  }

  // Debits: General staff to OPEX (Account 6101)
  if (total_opex > 0) {
    lines.push({
      account_code: "6101",
      account_name: "Operational Salaries & Wages",
      debit: total_opex,
      credit: 0,
      memo: `Operational staff salaries for ${period_name}`,
    });
  }

  // Fallback if neither was split
  if (lines.length === 0) {
    lines.push({
      account_code: "6101",
      account_name: "Salaries Expense",
      debit: total_net + total_bpjs + total_pph21,
      credit: 0,
      memo: `Payroll expense for ${period_name}`,
    });
  }

  // Credits:
  // Social Security Payable
  if (total_bpjs > 0) {
    lines.push({
      account_code: "2103",
      account_name: "Social Security Withholding Payable",
      debit: 0,
      credit: total_bpjs,
      memo: `Social Security deduction payable for ${period_name}`,
    });
  }

  // Employee Income Tax Payable
  if (total_pph21 > 0) {
    lines.push({
      account_code: "2104",
      account_name: "Employee Income Tax Payable",
      debit: 0,
      credit: total_pph21,
      memo: `Employee income tax withholding payable for ${period_name}`,
    });
  }

  // Cash / Bank Settlement (Credit)
  const totalDebit = lines.reduce((acc, l) => acc + (l.debit || 0), 0);
  const totalExistingCredit = lines.reduce((acc, l) => acc + (l.credit || 0), 0);
  const netBankCredit = Math.max(0, Math.round((totalDebit - totalExistingCredit) * 100) / 100);

  lines.push({
    account_code: "1101",
    account_name: "Cash & Bank Accounts",
    debit: 0,
    credit: netBankCredit,
    memo: `Bank disbursement for payroll ${voucher_number}`,
  });

  return postJournalEntry(db, {
    reference_type: "PAYROLL",
    reference_id: payroll_id,
    reference_number: voucher_number,
    description: `Payroll Disbursement & COGS Direct Labor Allocation for ${period_name}`,
    entry_date,
    lines,
    created_by: user || "FINANCE_PAYROLL",
  });
}

// 7. Production Material Issuance (Raw Material -> Work-in-Progress / WIP)
export function postMaterialIssuanceJournal(
  db: Database.Database,
  {
    project_id,
    spk_number,
    material_cost,
    reference_id,
    item_summary = "Raw Materials",
    user,
  }: {
    project_id: string;
    spk_number: string;
    material_cost: number;
    reference_id?: string;
    item_summary?: string;
    user?: string;
  },
) {
  if (material_cost <= 0) return null;

  return postJournalEntry(db, {
    reference_type: "WIP_MATERIAL_ISSUE",
    reference_id: reference_id || project_id,
    reference_number: spk_number || project_id,
    description: `Material Issuance to Floor: Work Order ${spk_number} (${item_summary})`,
    lines: [
      {
        account_code: "1105",
        account_name: "Work in Progress (WIP Inventory)",
        debit: material_cost,
        credit: 0,
        memo: `WIP allocation for Work Order ${spk_number}`,
      },
      {
        account_code: "1104",
        account_name: "Raw Materials Inventory",
        debit: 0,
        credit: material_cost,
        memo: `Raw materials issued to production floor`,
      },
    ],
    created_by: user || "PRODUCTION_FLOOR_OPS",
  });
}

// 8. Production Finish / Completion (WIP -> Finished Goods Inventory)
export function postProductionFinishJournal(
  db: Database.Database,
  {
    project_id,
    spk_number,
    total_material_cost,
    total_labor_cost = 0,
    total_overhead_cost = 0,
    user,
  }: {
    project_id: string;
    spk_number: string;
    total_material_cost: number;
    total_labor_cost?: number;
    total_overhead_cost?: number;
    user?: string;
  },
) {
  const totalCost = total_material_cost + total_labor_cost + total_overhead_cost;
  if (totalCost <= 0) return null;

  const lines: JournalLine[] = [
    {
      account_code: "1103",
      account_name: "Finished Goods Inventory",
      debit: totalCost,
      credit: 0,
      memo: `Finished Goods intake from completed Work Order ${spk_number}`,
    },
    {
      account_code: "1105",
      account_name: "Work in Progress (WIP Inventory)",
      debit: 0,
      credit: total_material_cost,
      memo: `WIP raw material relief for Work Order ${spk_number}`,
    },
  ];

  if (total_labor_cost > 0) {
    lines.push({
      account_code: "5102",
      account_name: "Direct Labor Absorbed",
      debit: 0,
      credit: total_labor_cost,
      memo: `Direct Labor absorbed into finished goods Work Order ${spk_number}`,
    });
  }

  if (total_overhead_cost > 0) {
    lines.push({
      account_code: "5104",
      account_name: "Applied Factory Overhead",
      debit: 0,
      credit: total_overhead_cost,
      memo: `Factory overhead absorbed into finished goods Work Order ${spk_number}`,
    });
  }

  return postJournalEntry(db, {
    reference_type: "PRODUCTION_FINISH",
    reference_id: project_id,
    reference_number: spk_number || project_id,
    description: `Production Completion & Finished Goods Capitalization for Work Order ${spk_number}`,
    lines,
    created_by: user || "PRODUCTION_QC_FINISH",
  });
}

// 9. Operational Expense Posting (Cash / Bank -> OPEX)
export function postExpenseJournal(
  db: Database.Database,
  {
    tx_id,
    category,
    amount,
    notes,
    entry_date,
    user,
  }: {
    tx_id: string;
    category: string;
    amount: number;
    notes?: string;
    entry_date?: string;
    user?: string;
  },
) {
  if (amount <= 0) return null;
  const isLogistics = String(category || "").toUpperCase() === "TRANSPORTATION";
  const accountCode = isLogistics ? "6103" : "6102";
  const accountName = isLogistics
    ? "Beban Logistik & Pengiriman (Freight Out)"
    : "Beban Operasional & Umum (General & Admin)";

  return postJournalEntry(db, {
    reference_type: "EXPENSE",
    reference_id: tx_id,
    reference_number: tx_id,
    description: `Operational Expense (${category}): ${notes || category}`,
    entry_date,
    lines: [
      {
        account_code: accountCode,
        account_name: accountName,
        debit: amount,
        credit: 0,
        memo: notes || `Operational expense - ${category}`,
      },
      {
        account_code: "1101",
        account_name: "Kas & Rekening Bank (Cash & Bank)",
        debit: 0,
        credit: amount,
        memo: `Cash/Bank disbursement for ${tx_id}`,
      },
    ],
    created_by: user || "FINANCE_EXPENSE",
  });
}

// 10. Void / Reversal Balanced Journal (mirrors original journal entry lines)
export function postVoidReversalJournal(
  db: Database.Database,
  {
    reference_type,
    reference_id,
    reference_number,
    original_reference_type,
    fallback_debit_account,
    fallback_credit_account,
    fallback_amount = 0,
    description,
    entry_date,
    user,
  }: {
    reference_type: "VOID_REVERSAL";
    reference_id: string;
    reference_number: string;
    original_reference_type: string;
    fallback_debit_account?: { code: string; name: string };
    fallback_credit_account?: { code: string; name: string };
    fallback_amount?: number;
    description: string;
    entry_date?: string;
    user?: string;
  },
) {
  const originalEntry = db
    .prepare(
      `SELECT id FROM journal_entries
       WHERE reference_id = ? AND reference_type = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(reference_id, original_reference_type) as { id: string } | undefined;

  let lines: JournalLine[] = [];

  if (originalEntry) {
    const origLines = db
      .prepare("SELECT account_code, account_name, debit, credit, memo FROM journal_entry_lines WHERE entry_id = ?")
      .all(originalEntry.id) as any[];
    lines = origLines.map((l) => ({
      account_code: l.account_code,
      account_name: l.account_name,
      debit: Number(l.credit) || 0,
      credit: Number(l.debit) || 0,
      memo: `Reversal: ${l.memo || reference_number}`,
    }));
  } else if (fallback_amount > 0 && fallback_debit_account && fallback_credit_account) {
    lines = [
      {
        account_code: fallback_debit_account.code,
        account_name: fallback_debit_account.name,
        debit: fallback_amount,
        credit: 0,
        memo: `Fallback reversal for ${reference_number}`,
      },
      {
        account_code: fallback_credit_account.code,
        account_name: fallback_credit_account.name,
        debit: 0,
        credit: fallback_amount,
        memo: `Fallback reversal for ${reference_number}`,
      },
    ];
  }

  if (lines.length < 2) return null;

  return postJournalEntry(db, {
    reference_type,
    reference_id,
    reference_number,
    description,
    entry_date,
    lines,
    created_by: user || "FINANCE_VOID",
  });
}


