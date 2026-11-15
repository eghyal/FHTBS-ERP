import { z } from "zod";

// --- FINANCIAL TRANSACTION SCHEMAS ---

export const JournalLineSchema = z.object({
  id: z.string().optional(),
  account_code: z.string().min(1, "Account code is required"),
  account_name: z.string().min(1, "Account name is required"),
  debit: z.number().min(0, "Debit cannot be negative"),
  credit: z.number().min(0, "Credit cannot be negative"),
  memo: z.string().optional().default(""),
});

export const CreateJournalEntrySchema = z.object({
  entry_date: z.string().min(1, "Journal date is required"),
  reference_number: z.string().optional().default(""),
  description: z.string().min(1, "Journal description is required"),
  category: z.string().optional().default("GENERAL"),
  allow_soft_lock_adjustment: z.boolean().optional().default(false),
  lines: z.array(JournalLineSchema).min(2, "Journal must have at least 2 lines (Debit & Credit)"),
}).refine((data) => {
  const totalDebit = data.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = data.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}, {
  message: "Total Debit must balance with Total Credit",
  path: ["lines"],
});

export const InvoicePaymentSchema = z.object({
  invoice_id: z.string().optional(),
  pin: z.string().min(1, "Daily authorization PIN is required"),
  amount: z.number().positive("Payment amount must be greater than 0").optional(),
  payment_method: z.string().optional().default("BANK TRANSFER"),
  bank_account_code: z.string().optional(),
  payment_date: z.string().optional(),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});

export const ExpenseTransactionSchema = z.object({
  pin: z.string().min(1, "Daily authorization PIN is required"),
  amount: z.number().positive("Expense amount must be greater than 0"),
  category: z.enum(["CONSUMABLE", "TRANSPORTATION", "OTHERS"], {
    message: "Expense category must be CONSUMABLE, TRANSPORTATION, or OTHERS",
  }),
  payment_method: z.string().optional().default("BANK TRANSFER"),
  notes: z.string().optional().default(""),
});

export const COAAccountSchema = z.object({
  code: z.string().min(1, "Account code is required").max(30),
  name: z.string().min(1, "Account name is required").max(100),
  category: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"], {
    message: "Account category must be ASSET, LIABILITY, EQUITY, REVENUE, or EXPENSE",
  }),
  type: z.string().min(1, "Account type is required"),
  normal_balance: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"),
  description: z.string().optional().default(""),
  parent_code: z.string().nullable().optional(),
});

export const FinanceDisbursementSchema = z.object({
  recipient_name: z.string().min(1, "Recipient name is required"),
  amount: z.number().positive("Disbursement amount must be greater than 0"),
  category: z.string().min(1, "Category is required"),
  account_code: z.string().min(1, "Source cash/bank account is required"),
  expense_account_code: z.string().min(1, "Target expense account is required"),
  payment_date: z.string().min(1, "Payment date is required"),
  notes: z.string().optional().default(""),
});

// --- INVENTORY TRANSACTION SCHEMAS ---

export const StockAdjustmentSchema = z.object({
  item_id: z.string().min(1, "Item ID is required"),
  warehouse_id: z.string().optional().default("MAIN"),
  adjustment_type: z.enum(["INCREASE", "DECREASE", "SET"], {
    message: "Adjustment type must be INCREASE, DECREASE, or SET",
  }),
  quantity: z.number().positive("Adjustment quantity must be greater than 0"),
  reason: z.string().min(1, "Stock adjustment reason is required"),
  cost_per_unit: z.number().min(0).optional().default(0),
});

export const StockTransferSchema = z.object({
  item_id: z.string().min(1, "Item ID is required"),
  source_warehouse_id: z.string().min(1, "Source warehouse is required"),
  target_warehouse_id: z.string().min(1, "Target warehouse is required"),
  quantity: z.number().positive("Transfer quantity must be greater than 0"),
  notes: z.string().optional().default(""),
}).refine((data) => data.source_warehouse_id !== data.target_warehouse_id, {
  message: "Target warehouse cannot be the same as source warehouse",
  path: ["target_warehouse_id"],
});

export const CreateInventoryItemSchema = z.object({
  item_code: z.string().min(1, "Item code is required").max(50),
  name: z.string().min(1, "Item name is required").max(200),
  type: z.enum(["RAW", "WIP", "FG", "CONSUMABLE", "ASSET"]).default("RAW"),
  uom: z.string().min(1, "Unit of Measure (UOM) is required").default("PCS"),
  dimension: z.string().optional().nullable(),
  spec: z.string().optional().nullable(),
  unit_price: z.number().min(0, "Unit price cannot be negative").default(0),
  min_stock: z.number().min(0).default(0),
  reorder_point: z.number().min(0).default(0),
  lead_time_days: z.number().min(0).default(0),
  warehouse_id: z.string().optional().default("MAIN"),
  initial_stock: z.number().min(0).optional().default(0),
});

export const UpdateInventoryItemSchema = CreateInventoryItemSchema.partial();
